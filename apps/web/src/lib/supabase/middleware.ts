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

	// Do not put code between createServerClient and getUser: getUser is what
	// validates the token with Supabase and refreshes it when needed.
	const {
		data: { user },
	} = await supabase.auth.getUser();

	// Hand the verified name forward so the page chrome needs no second call.
	const metadata = (user?.user_metadata ?? {}) as {
		full_name?: string;
		name?: string;
	};
	const name = metadata.full_name ?? metadata.name ?? user?.email ?? null;
	if (name) headers.set(DISPLAY_NAME_HEADER, encodeDisplayName(name));

	const response = NextResponse.next({ request: { headers } });
	response.headers.set("Content-Security-Policy", csp);
	for (const cookie of refreshed) {
		response.cookies.set(cookie.name, cookie.value, cookie.options);
	}
	return response;
}
