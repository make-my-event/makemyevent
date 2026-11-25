import { env } from "./env";
import { TURNSTILE_ORIGIN, turnstileSiteKey } from "./turnstile";

/** Map styles, tiles, fonts and icons for the venue map: one host. */
const MAP_TILES = "https://tiles.openfreemap.org";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Builds the Content-Security-Policy for one request.
 *
 * Every script must carry the request's nonce. That rules out injected
 * scripts, which is the whole point: a cross-site-scripting bug cannot run
 * code it did not get a nonce for. `strict-dynamic` lets a trusted script
 * load the chunks it needs without listing each one.
 *
 * Next.js inlines its own scripts into the page, and their content differs per
 * page, so they cannot be allowed by hash. A fresh nonce per request is the
 * only strict option, and it means pages are rendered on demand rather than
 * served from a prerendered file.
 */
export function contentSecurityPolicy(nonce: string): string {
	return [
		"default-src 'self'",
		// Styles come from stylesheet files, but Next inlines a small style
		// element for fonts and streamed markup. Styles cannot execute code,
		// so this is the one allowance made.
		"style-src 'self' 'unsafe-inline'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProduction ? "" : " 'unsafe-eval'"}`,
		// Event posters and logos are served from our Supabase project's
		// Storage, and from nowhere else.
		// The venue map's tiles come from OpenFreeMap.
		`img-src 'self' data: blob: ${new URL(env.supabaseUrl).origin} ${MAP_TILES}`,
		"font-src 'self'",
		`connect-src 'self' ${MAP_TILES}${isProduction ? "" : " ws: http://localhost:*"}`,
		// The map draws in a worker it creates from a blob.
		"worker-src 'self' blob:",
		"manifest-src 'self'",
		// Only the sign-in form's bot check is embedded (its script needs no
		// allowance: strict-dynamic covers what our own scripts load). On every
		// page, because moving to sign-in inside the site keeps the policy of the
		// page it started from.
		`frame-src ${turnstileSiteKey() ? TURNSTILE_ORIGIN : "'none'"}`,
		// Nothing may embed us: clickjacking is impossible.
		"frame-ancestors 'none'",
		"object-src 'none'",
		// Forms may only post back to this site. Sign-in posts to our own server
		// actions, which then redirect onward to Google.
		"form-action 'self'",
		// A stolen page cannot rewrite relative URLs to point somewhere else.
		"base-uri 'none'",
		...(isProduction ? ["upgrade-insecure-requests"] : []),
	].join("; ");
}

/** Header Next.js reads to put the nonce on the scripts it generates itself. */
export const NONCE_HEADER = "x-nonce";
