/**
 * Whether `email` is a **verified** address on the GitHub account behind
 * `accessToken`.
 *
 * Auth.js's GitHub provider falls back to the account's primary (or first)
 * email without checking GitHub's `verified` flag. With email-based account
 * linking that is not enough, so GitHub sign-ins are checked here explicitly.
 * Any failure (network, unexpected response) returns false: fail closed.
 */
export async function isVerifiedGitHubEmail(
	accessToken: string | undefined,
	email: string,
	fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
	if (!accessToken) return false;
	try {
		const res = await fetchImpl("https://api.github.com/user/emails", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github+json",
				"User-Agent": "makemyevent",
			},
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return false;
		const emails: unknown = await res.json();
		if (!Array.isArray(emails)) return false;
		const target = email.trim().toLowerCase();
		return emails.some(
			(entry: unknown) =>
				typeof entry === "object" &&
				entry !== null &&
				(entry as { email?: unknown }).email !== undefined &&
				String((entry as { email: unknown }).email).toLowerCase() === target &&
				(entry as { verified?: unknown }).verified === true,
		);
	} catch {
		return false;
	}
}
