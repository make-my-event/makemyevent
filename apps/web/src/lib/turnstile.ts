/**
 * Bot protection on the sign-in form: Cloudflare Turnstile.
 *
 * The form gets a one-time token from Turnstile in the browser and sends it
 * with the email address. Supabase checks it with Cloudflare before sending
 * anything (its CAPTCHA setting, where the secret key lives), so a bot that
 * skips this site and calls Supabase directly is refused too.
 *
 * The site key is public. Without one the form works as it did before, which
 * must be so only while Supabase's setting is off: with it on, Supabase
 * refuses every email sign-in that carries no token.
 */
export function turnstileSiteKey(): string | null {
	return process.env.TURNSTILE_SITE_KEY || null;
}

/** Turnstile's script and the frame it draws its box in. */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** Longer than any token Cloudflare issues (2,048). */
export const TURNSTILE_TOKEN_MAX = 2048;
