import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy, NONCE_HEADER } from "../csp";
import { env } from "../env";
import { hardenCookie } from "./cookies";

/** Keeps the sign-in session fresh, and sets the per-request security policy. */
export async function updateSession(request: NextRequest) {
	const nonce = crypto.randomUUID().replaceAll("-", "");
	const csp = contentSecurityPolicy(nonce);

	// Next reads these from the request to nonce the scripts it writes itself.
	const headers = new Headers(request.headers);
	headers.set(NONCE_HEADER, nonce);
	headers.set("Content-Security-Policy", csp);

	let response = NextResponse.next({ request: { headers } });
	response.headers.set("Content-Security-Policy", csp);

	const supabase = createServerClient(
		env.supabaseUrl,
		env.supabasePublishableKey,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					for (const { name, value } of cookiesToSet) {
						request.cookies.set(name, value);
					}
					response = NextResponse.next({ request: { headers } });
					response.headers.set("Content-Security-Policy", csp);
					for (const { name, value, options } of cookiesToSet) {
						response.cookies.set(name, value, hardenCookie(options));
					}
				},
			},
		},
	);

	// Do not put code between createServerClient and getUser: getUser is what
	// validates the token with Supabase and refreshes it when needed.
	await supabase.auth.getUser();

	return response;
}
