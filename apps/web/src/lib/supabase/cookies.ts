import type { CookieOptions } from "@supabase/ssr";

/**
 * Security flags forced onto every auth cookie we write.
 *
 * httpOnly is the important one: the sign-in verifier and the session must not
 * be readable by page scripts, so that a cross-site-scripting bug elsewhere on
 * the site cannot steal a sign-in in progress. Nothing in the browser needs to
 * read these — every Supabase call happens on the server.
 */
export function hardenCookie(
	options: CookieOptions | undefined,
): CookieOptions {
	return {
		...options,
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: options?.path ?? "/",
	};
}
