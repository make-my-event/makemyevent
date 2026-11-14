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
		"img-src 'self' data: blob:",
		"font-src 'self'",
		`connect-src 'self'${isProduction ? "" : " ws: http://localhost:*"}`,
		"manifest-src 'self'",
		// Nothing is embedded, and nothing may embed us: clickjacking is impossible.
		"frame-src 'none'",
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
