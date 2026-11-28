import "server-only";
import {
	TURNSTILE_ORIGIN,
	TURNSTILE_TOKEN_MAX,
	turnstileSiteKey,
} from "./turnstile";

/**
 * Checking a Turnstile token on our own server, for forms Supabase does not
 * check for us (sign-in is checked by Supabase). Configured by
 * TURNSTILE_SECRET_KEY, the secret half of the same widget as
 * TURNSTILE_SITE_KEY.
 *
 *   passed        the token is real, fresh, and was issued for `action`
 *   failed        it isn't, or there was none
 *   unavailable   Cloudflare didn't answer, or the secret isn't set while
 *                 the site key is: refused, never waved through
 *   off           no site key, so the form has no check (local development)
 */
export type Verdict = "passed" | "failed" | "unavailable" | "off";

export async function verifyTurnstile(
	token: FormDataEntryValue | null,
	action: string,
): Promise<Verdict> {
	if (!turnstileSiteKey()) return "off";
	const secret = process.env.TURNSTILE_SECRET_KEY;
	if (!secret) {
		console.error(
			JSON.stringify({ event: "turnstile.unconfigured", detail: "no secret" }),
		);
		return "unavailable";
	}
	if (typeof token !== "string" || !token || token.length > TURNSTILE_TOKEN_MAX)
		return "failed";

	let response: Response;
	try {
		response = await fetch(`${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ secret, response: token }),
			signal: AbortSignal.timeout(5_000),
		});
	} catch {
		return "unavailable";
	}
	if (!response.ok) return "unavailable";
	let body: { success?: unknown; action?: unknown };
	try {
		body = (await response.json()) as typeof body;
	} catch {
		return "unavailable";
	}
	return body.success === true && body.action === action ? "passed" : "failed";
}
