export const DEFAULT_REDIRECT = "/";

/**
 * Where to send someone after sign-in. Only paths on this site are allowed,
 * so a crafted link can never bounce a freshly signed-in user to another site.
 */
export function safeRedirectPath(value: string | null | undefined): string {
	if (!value) return DEFAULT_REDIRECT;
	if (value.length > 512) return DEFAULT_REDIRECT;
	// Must be a single-slash absolute path: "/events", never "//evil.com" or "/\evil.com".
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.startsWith("/\\")
	) {
		return DEFAULT_REDIRECT;
	}
	// No control characters, tabs or newlines (header and parser tricks).
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point; they are rejected, never accepted.
	if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_REDIRECT;
	try {
		const base = "https://makemyevent.invalid";
		const url = new URL(value, base);
		if (url.origin !== base) return DEFAULT_REDIRECT;
		// Never loop back into the sign-in flow itself.
		if (url.pathname === "/signin" || url.pathname.startsWith("/auth/"))
			return DEFAULT_REDIRECT;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return DEFAULT_REDIRECT;
	}
}

/** Short-lived cookie that carries the destination across the sign-in round trip. */
export const NEXT_COOKIE = "mme_next";
