import { createHash } from "node:crypto";

/**
 * Whether a password appears in known data breaches, via the Have I Been
 * Pwned "range" API (k-anonymity): only the first 5 hex characters of the
 * password's SHA-1 are sent; the match is done locally on the returned
 * suffixes. The password and its full hash never leave the server.
 * `Add-Padding` makes every response the same size, so the prefix's result
 * count is not observable on the network.
 *
 * NIST SP 800-63B recommends rejecting such passwords. If the service cannot
 * be reached this returns false (and logs), so sign-up and password reset do
 * not depend on a third party's availability.
 */
export async function isBreachedPassword(
	password: string,
	fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
	const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
	const prefix = sha1.slice(0, 5);
	const suffix = sha1.slice(5);

	try {
		const res = await fetchImpl(
			`https://api.pwnedpasswords.com/range/${prefix}`,
			{
				headers: { "Add-Padding": "true", "User-Agent": "makemyevent" },
				signal: AbortSignal.timeout(3000),
			},
		);
		if (!res.ok) {
			console.error(
				`[passwords] Breach check unavailable (HTTP ${res.status}).`,
			);
			return false;
		}
		const body = await res.text();
		for (const line of body.split("\n")) {
			const [lineSuffix, count] = line.trim().split(":");
			// Padding entries have a count of 0 and are not real matches.
			if (lineSuffix === suffix && Number(count) > 0) return true;
		}
		return false;
	} catch (err) {
		console.error("[passwords] Breach check failed:", err);
		return false;
	}
}
