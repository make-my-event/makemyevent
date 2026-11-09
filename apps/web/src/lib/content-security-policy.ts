/**
 * Content-Security-Policy for app pages, sent per request by src/proxy.ts
 * with a fresh nonce. Currently sent as Content-Security-Policy-Report-Only:
 * violations are reported to /api/csp-report but nothing is blocked, so the
 * policy can be checked against real traffic before it is enforced.
 *
 * Allowlist, from what the pages load:
 * - scripts: same origin plus the per-request nonce; 'strict-dynamic' lets
 *   nonce'd scripts load their own chunks. Development adds 'unsafe-eval'
 *   for React's dev tooling.
 * - connect: same origin and Supabase (banner uploads to signed URLs).
 *   Development adds ws: for hot reload.
 * - images: same origin, data:/blob: (previews, QR codes) and any https
 *   source (organizer logos and banners are https URLs, see url-validation).
 * - form-action: Google/GitHub for OAuth sign-in redirects.
 * - no plugins, no framing, no <base> hijacking.
 */
export function buildContentSecurityPolicy(options: {
	nonce: string;
	isDev: boolean;
}): string {
	const { nonce, isDev } = options;
	const directives: Record<string, string[]> = {
		"default-src": ["'self'"],
		"script-src": [
			"'self'",
			`'nonce-${nonce}'`,
			"'strict-dynamic'",
			...(isDev ? ["'unsafe-eval'"] : []),
		],
		"style-src": ["'self'", "'unsafe-inline'"],
		"img-src": ["'self'", "data:", "blob:", "https:"],
		"font-src": ["'self'", "data:"],
		"connect-src": [
			"'self'",
			"https://*.supabase.co",
			...(isDev ? ["ws:"] : []),
		],
		"media-src": ["'self'", "blob:"],
		"worker-src": ["'self'", "blob:"],
		"frame-src": ["'none'"],
		"object-src": ["'none'"],
		"base-uri": ["'self'"],
		"form-action": [
			"'self'",
			"https://accounts.google.com",
			"https://github.com",
		],
		"frame-ancestors": ["'none'"],
		"report-uri": ["/api/csp-report"],
		"report-to": ["csp"],
	};
	return Object.entries(directives)
		.map(([name, values]) => `${name} ${values.join(" ")}`)
		.join("; ");
}

/** 128-bit random nonce, base64 (the format Next.js extracts). */
export function createNonce(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
