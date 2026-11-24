import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy, NONCE_HEADER } from "../csp";
import { env } from "../env";
import { hardenCookie } from "./cookies";
import { DISPLAY_NAME_HEADER, encodeDisplayName } from "./identity";

/** Supabase names every auth cookie, session and PKCE verifier alike, `sb-…`. */
function hasAuthCookie(request: NextRequest): boolean {
	return request.cookies.getAll().some(({ name }) => name.startsWith("sb-"));
}

/**
 * A page read signed out that only works signed in: sent to sign-in and back
 * here, with a real 307, before anything renders. Without this the page would
 * start streaming its loading skeleton and could only redirect from inside
 * the page. Only reads (GET, HEAD): a form post goes on to its own handler,
 * which answers for itself.
 *
 * This is a courtesy, not the gate. Every dashboard page still checks the
 * session live (getCurrentUser) and runs its queries under row-level security.
 */
function signInFirst(request: NextRequest): NextResponse | null {
	const { pathname, search } = request.nextUrl;
	if (request.method !== "GET" && request.method !== "HEAD") return null;
	if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/"))
		return null;
	const url = request.nextUrl.clone();
	url.pathname = "/signin";
	url.search = `?${new URLSearchParams({ next: `${pathname}${search}` })}`;
	return NextResponse.redirect(url, 307);
}

/** Keeps the sign-in session fresh, and sets the per-request security policy. */
export async function updateSession(request: NextRequest) {
	const nonce = crypto.randomUUID().replaceAll("-", "");
	const csp = contentSecurityPolicy(nonce);

	// Next reads these from the request to nonce the scripts it writes itself.
	const headers = new Headers(request.headers);
	headers.set(NONCE_HEADER, nonce);
	headers.set("Content-Security-Policy", csp);
	// Always cleared first. A browser may send anything it likes under this
	// name, and only a value this function writes below may reach a page.
	headers.delete(DISPLAY_NAME_HEADER);

	// Without an auth cookie there is no session to validate or refresh, so
	// the whole Supabase round trip is skipped. Public pages are the bulk of
	// the traffic and almost all of it arrives signed out.
	if (!hasAuthCookie(request)) {
		const toSignIn = signInFirst(request);
		if (toSignIn) return toSignIn;
		const response = NextResponse.next({ request: { headers } });
		response.headers.set("Content-Security-Policy", csp);
		return response;
	}

	// Cookies are collected rather than written straight away: the response
	// has to be built after getUser, because the headers handed to the render
	// are copied at the moment the response is created.
	const refreshed: { name: string; value: string; options: CookieOptions }[] =
		[];

	const supabase = createServerClient(
		env.supabaseUrl,
		env.supabasePublishableKey,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					for (const { name, value, options } of cookiesToSet) {
						request.cookies.set(name, value);
						refreshed.push({ name, value, options: hardenCookie(options) });
					}
				},
			},
		},
	);

	// Do not put code between createServerClient and getClaims: it reads the
	// session, refreshes it when the access token has expired (the only time
	// this makes a network call), and verifies the token's signature and
	// expiry locally against the project's cached public key (ES256). It
	// decides nothing about access, so a local check is enough here; anything
	// that gates access calls getCurrentUser, which asks Supabase live.
	const { data } = await supabase.auth.getClaims();
	const claims = data?.claims;

	// Hand the verified name forward so the page chrome needs no second call.
	const metadata = (claims?.user_metadata ?? {}) as {
		full_name?: unknown;
		name?: unknown;
	};
	const name =
		[metadata.full_name, metadata.name, claims?.email].find(
			(value): value is string => typeof value === "string" && value !== "",
		) ?? null;
	if (name) headers.set(DISPLAY_NAME_HEADER, encodeDisplayName(name));

	// A session that could not be verified or refreshed is signed out. Any
	// cookies Supabase cleared go with the redirect.
	const toSignIn = claims ? null : signInFirst(request);
	const response = toSignIn ?? NextResponse.next({ request: { headers } });
	response.headers.set("Content-Security-Policy", csp);
	for (const cookie of refreshed) {
		response.cookies.set(cookie.name, cookie.value, cookie.options);
	}
	return response;
}
