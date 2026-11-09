import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "db";

/**
 * Fixed-window rate limiting backed by Postgres (RateLimitBucket).
 *
 * - One atomic statement per check (INSERT ... ON CONFLICT DO UPDATE), so
 *   concurrent requests cannot slip past the limit.
 * - Window boundaries use the database clock, so app servers with skewed
 *   clocks agree.
 * - Keys are "<scope>:<sha256(identifier)>": no raw email or IP is stored.
 * - Parameterised tagged-template $queryRaw only (docs/security.md).
 */

export interface RateLimitRule {
	/** Short name for the action and identifier type, e.g. "login:ip". */
	scope: string;
	limit: number;
	windowMs: number;
}

export interface RateLimitResult {
	allowed: boolean;
	count: number;
	retryAfterSeconds: number;
}

export function rateLimitKey(scope: string, identifier: string): string {
	const digest = createHash("sha256")
		.update(identifier.trim().toLowerCase())
		.digest("hex");
	return `${scope}:${digest}`;
}

/** Counts one attempt against the rule and reports whether it is allowed. */
export async function consumeRateLimit(
	client: Pick<PrismaClient, "$queryRaw" | "$executeRaw">,
	rule: RateLimitRule,
	identifier: string,
): Promise<RateLimitResult> {
	const key = rateLimitKey(rule.scope, identifier);
	const windowMs = Math.max(1, Math.floor(rule.windowMs));

	const rows = await client.$queryRaw<{ count: number; retry_after: number }[]>`
		INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
		VALUES (${key}, 1, now() + (${windowMs} * interval '1 millisecond'))
		ON CONFLICT ("key") DO UPDATE SET
			"count" = CASE
				WHEN "RateLimitBucket"."resetAt" <= now() THEN 1
				ELSE "RateLimitBucket"."count" + 1
			END,
			"resetAt" = CASE
				WHEN "RateLimitBucket"."resetAt" <= now()
					THEN now() + (${windowMs} * interval '1 millisecond')
				ELSE "RateLimitBucket"."resetAt"
			END
		RETURNING
			"count",
			GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))))::int AS retry_after
	`;

	// Occasionally drop long-expired buckets so the table stays small.
	if (Math.random() < 0.01) {
		await client.$executeRaw`
			DELETE FROM "RateLimitBucket" WHERE "resetAt" < now() - interval '1 day'
		`;
	}

	const row = rows[0];
	const count = Number(row?.count ?? 0);
	return {
		allowed: count <= rule.limit,
		count,
		retryAfterSeconds: Number(row?.retry_after ?? 0),
	};
}

function describeWait(seconds: number): string {
	if (seconds <= 60) return "a minute";
	const minutes = Math.ceil(seconds / 60);
	if (minutes < 60) return `${minutes} minutes`;
	const hours = Math.ceil(minutes / 60);
	return hours === 1 ? "an hour" : `${hours} hours`;
}

/**
 * Consumes every rule (all are counted, so a blocked request still counts
 * toward the others) and throws TOO_MANY_REQUESTS if any limit is exceeded.
 */
export async function enforceRateLimits(
	client: Pick<PrismaClient, "$queryRaw" | "$executeRaw">,
	checks: Array<{ rule: RateLimitRule; identifier: string | null | undefined }>,
): Promise<void> {
	let worst: RateLimitResult | null = null;
	for (const { rule, identifier } of checks) {
		const result = await consumeRateLimit(
			client,
			rule,
			identifier && identifier.length > 0 ? identifier : "unknown",
		);
		if (
			!result.allowed &&
			(worst === null || result.retryAfterSeconds > worst.retryAfterSeconds)
		) {
			worst = result;
		}
	}
	if (worst) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: `Too many attempts. Please try again in ${describeWait(worst.retryAfterSeconds)}.`,
		});
	}
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** All limits in one place, so they can be reviewed and tuned together. */
export const RATE_LIMITS = {
	// Sign-in: strict per email+IP (stops guessing one account from one place
	// without letting a stranger lock the owner out from elsewhere), a looser
	// per-email ceiling (stops distributed guessing), and per IP (stops one
	// source spraying many accounts).
	loginEmailIp: { scope: "login:email-ip", limit: 10, windowMs: 15 * MINUTE },
	loginEmail: { scope: "login:email", limit: 100, windowMs: HOUR },
	loginIp: { scope: "login:ip", limit: 50, windowMs: 15 * MINUTE },
	registerIp: { scope: "register:ip", limit: 10, windowMs: HOUR },
	changePasswordUser: {
		scope: "change-password:user",
		limit: 10,
		windowMs: 15 * MINUTE,
	},
	// Booking sends an email to the address given: limit per IP and per
	// attendee address (stops mail-bombing one person).
	bookIp: { scope: "book:ip", limit: 10, windowMs: 10 * MINUTE },
	bookEmail: { scope: "book:email", limit: 5, windowMs: HOUR },
	resendLinkIp: { scope: "ticket-resend:ip", limit: 10, windowMs: HOUR },
	transferIp: { scope: "transfer:ip", limit: 20, windowMs: HOUR },
	ticketLookupIp: { scope: "ticket-lookup:ip", limit: 60, windowMs: MINUTE },
	// Invitations email arbitrary addresses on behalf of a signed-in user.
	inviteUser: { scope: "invite:user", limit: 50, windowMs: HOUR },
} as const satisfies Record<string, RateLimitRule>;
