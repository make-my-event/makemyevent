import "server-only";
import { headers } from "next/headers";
import { LIMITS, type LimitName, type Subject, waitText } from "./limits";
import {
	createLimiter,
	inboxOf,
	type Limiter,
	networkOf,
	redisStore,
} from "./rate-limiter";

/**
 * Asking a limit, from a server action or a route. Configured by
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the app's
 * environment (the REST pair from Upstash, not the redis:// address).
 */

/** One per process, like the database: Next loads this module several times. */
const globalForLimits = globalThis as unknown as { limiter?: Limiter };

function limiter(): Limiter {
	if (globalForLimits.limiter) return globalForLimits.limiter;
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	const set = url && token ? { url, token } : null;
	const made = createLimiter({
		shared: set ? redisStore(set) : null,
		alone: !set && process.env.NODE_ENV !== "production",
		secret: set?.token ?? "local",
		report: (event, detail) => {
			const line = JSON.stringify({ event, ...detail });
			if (event === "rate_limit.refused") console.warn(line);
			else console.error(line);
		},
	});
	globalForLimits.limiter = made;
	return made;
}

type Needs<N extends LimitName> = Extract<
	(typeof LIMITS)[N]["rules"][number]["by"],
	"user" | "email"
>;

export type Slow = {
	/** For the person: what happened, and how long to wait. */
	message: string;
	/** Whole seconds, for a Retry-After header. */
	retryAfter: number;
};

/**
 * Counts one use (or `cost` of them) against a limit. Null when it may go
 * ahead; otherwise what to tell the person, and nothing was counted.
 *
 * Asked after the input is checked and before anything is written, sent or
 * fetched. `who` holds ids the server has verified, never ones it was sent;
 * the network is read from the request here.
 */
export async function limited<N extends LimitName>(
	name: N,
	who: { [K in Needs<N>]: string },
	cost = 1,
): Promise<Slow | null> {
	const incoming = await headers();
	const { user, email }: { user?: string; email?: string } = who;
	const subjects: Partial<Record<Subject, string>> = {
		...(user ? { user } : {}),
		...(email ? { email: inboxOf(email) } : {}),
		ip: networkOf((key) => incoming.get(key), Boolean(process.env.VERCEL)),
	};
	const verdict = await limiter().check(name, LIMITS[name], subjects, cost);
	if (verdict.ok) return null;
	const says =
		verdict.reason === "unavailable"
			? "This is paused for a moment."
			: LIMITS[name].says;
	return {
		message: `${says} Wait ${waitText(verdict.retryAfter)}, then try again.`,
		retryAfter: verdict.retryAfter,
	};
}

/** The same, as a route's answer. */
export function tooMany(slow: Slow): Response {
	return Response.json(
		{ error: slow.message },
		{
			status: 429,
			headers: {
				"Retry-After": String(slow.retryAfter),
				"Cache-Control": "no-store",
			},
		},
	);
}
