import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";
import { hardenCookie } from "./cookies";

export async function createClient() {
	const cookieStore = await cookies();

	return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, hardenCookie(options));
					}
				} catch {
					// Called from a Server Component, which cannot write cookies.
					// The middleware refreshes the session, so this is safe to ignore.
				}
			},
		},
	});
}
