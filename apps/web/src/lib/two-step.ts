/**
 * Two-step sign-in, the parts that decide and calculate. Nothing here talks
 * to Supabase, the database or the request, so every rule can be tested. No Node modules either: the middleware
 * loads this file, through identity.ts, where there are none.
 */

export type Aal = "aal1" | "aal2";

/** What the server has just confirmed about a session. */
export type Assurance = {
	aal: Aal;
	/** The account has an authenticator that was set up to the end. */
	hasAuthenticator: boolean;
	/** When this session last gave a code from it; null if it never has. */
	codeGivenAt: Date | null;
};

type Factor = { factor_type?: unknown; status?: unknown };

/** Only an authenticator that was set up to the end counts. */
export function verifiedTotp<T extends Factor>(
	factors: readonly T[] | undefined,
): T[] {
	return (factors ?? []).filter(
		(f) => f.factor_type === "totp" && f.status === "verified",
	);
}

function claimsOf(accessToken: string): Record<string, unknown> {
	try {
		const body = accessToken.split(".")[1] ?? "";
		const claims: unknown = JSON.parse(
			Buffer.from(body, "base64url").toString("utf8"),
		);
		return claims && typeof claims === "object"
			? (claims as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/**
 * The level of a session. The token must be one Supabase has just accepted,
 * and the factors the ones it answered with.
 *
 * aal2 takes both: a token that says so, and an authenticator still on the
 * account. A token keeps its level until it expires, so without the second
 * an authenticator removed elsewhere would count for up to an hour more.
 */
export function assuranceOf(
	accessToken: string,
	factors: readonly Factor[] | undefined,
): Assurance {
	const claims = claimsOf(accessToken);
	const hasAuthenticator = verifiedTotp(factors).length > 0;
	const aal = claims.aal === "aal2" && hasAuthenticator ? "aal2" : "aal1";

	let last = 0;
	if (aal === "aal2" && Array.isArray(claims.amr)) {
		for (const entry of claims.amr as {
			method?: unknown;
			timestamp?: unknown;
		}[])
			if (entry?.method === "totp" && typeof entry.timestamp === "number")
				last = Math.max(last, entry.timestamp);
	}
	return {
		aal,
		hasAuthenticator,
		codeGivenAt: last > 0 ? new Date(last * 1000) : null,
	};
}

/**
 * What someone must do before going on.
 *
 *   self  their own account and tickets: a code, if they have an authenticator
 *   team    an event's dashboard: the same, and those who run an event
 *           with people in it must have an authenticator. A volunteer, or
 *           the owner of a private draft, need not.
 *   people  bringing someone in (a guest, a team member, publishing):
 *           everyone must have one
 */
export type Need = "self" | "team" | "people";
export type NextStep = "go" | "enter_code" | "set_up";

export function nextStep(
	{ aal, hasAuthenticator }: Pick<Assurance, "aal" | "hasAuthenticator">,
	need: Need,
	runsEvents: boolean,
): NextStep {
	if (aal === "aal2" && hasAuthenticator) return "go";
	if (hasAuthenticator) return "enter_code";
	if (need === "people" || (need === "team" && runsEvents)) return "set_up";
	return "go";
}

/** How long a code stands for the next change to two-step sign-in itself. */
const FRESH_MS = 10 * 60_000;

/** Given a code recently enough to change the authenticator or its codes. */
export function isFresh(
	{ aal, codeGivenAt }: Pick<Assurance, "aal" | "codeGivenAt">,
	now: Date,
): boolean {
	return (
		aal === "aal2" &&
		codeGivenAt !== null &&
		now.getTime() - codeGivenAt.getTime() < FRESH_MS
	);
}

/** Six digits, however they were spaced; null for anything else. */
export function readCode(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const digits = value.replace(/[\s-]/g, "");
	return /^\d{6}$/.test(digits) ? digits : null;
}
