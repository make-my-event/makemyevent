import { getToken } from "next-auth/jwt";

const SECURE_COOKIE = "__Secure-authjs.session-token";
const DEV_COOKIE = "authjs.session-token";

export interface SessionClaims {
	/** Key of the Session row used for device tracking and revocation. */
	sessionToken: string | null;
	/** When the user last actually signed in (ms since epoch). */
	authTime: number | null;
}

/**
 * Server-only claims from the signed session JWT. These are deliberately not
 * copied into the session object (which `/api/auth/session` returns to
 * browser JavaScript): docs/security.md, "never store a session token
 * somewhere JS can read it".
 *
 * The cookie name depends on HTTPS. Browsers only accept `__Secure-` cookies
 * over HTTPS, so its presence cannot be forged over plain HTTP; Auth.js salts
 * the JWT with the cookie name, so the matching name must be used.
 */
export async function readSessionClaims(req: Request): Promise<SessionClaims> {
	const secret = process.env.AUTH_SECRET;
	if (!secret) return { sessionToken: null, authTime: null };

	const cookieHeader = req.headers.get("cookie") ?? "";
	const cookieName = cookieHeader.includes(SECURE_COOKIE)
		? SECURE_COOKIE
		: DEV_COOKIE;

	try {
		const token = await getToken({
			req,
			secret,
			cookieName,
			salt: cookieName,
			secureCookie: cookieName === SECURE_COOKIE,
		});
		return {
			sessionToken:
				typeof token?.sessionToken === "string" ? token.sessionToken : null,
			authTime: typeof token?.authTime === "number" ? token.authTime : null,
		};
	} catch (err) {
		console.error("[auth] Reading session claims failed:", err);
		return { sessionToken: null, authTime: null };
	}
}
