const DEFAULT_CALLBACK = "/dashboard";

/**
 * Returns a same-site path to send the user to after sign-in, or the default.
 *
 * `callbackUrl` comes from the query string, so it is attacker-controlled. It
 * is only accepted when it is a path on this site: it must start with a single
 * "/", and resolving it must not leave this origin. That rejects
 * `javascript:` / `data:` URLs (script execution when assigned to
 * `window.location`), absolute URLs to other sites, protocol-relative
 * `//evil.example`, and backslash tricks such as `/\evil.example`, which
 * browsers treat like `//`.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
	if (!raw) return DEFAULT_CALLBACK;
	const value = raw.trim();
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\")
	) {
		return DEFAULT_CALLBACK;
	}
	// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
	if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_CALLBACK;

	const base = "https://same-origin.invalid";
	let resolved: URL;
	try {
		resolved = new URL(value, base);
	} catch {
		return DEFAULT_CALLBACK;
	}
	if (resolved.origin !== base) return DEFAULT_CALLBACK;

	return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
