import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "../env";
import { hardenCookie } from "./cookies";

/** Keeps the sign-in session fresh on every request. */
export async function updateSession(request: NextRequest) {
	let response = NextResponse.next({ request });

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
					response = NextResponse.next({ request });
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
