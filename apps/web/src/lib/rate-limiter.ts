import { createHmac } from "node:crypto";
import type { Limit, Rule, Subject } from "./limits.ts";

/**
 * Counting, shared by every server instance through Redis.
 *
 * Each rule is one number per subject: the moment its allowance would be
 * full again (GCRA, the "generic cell rate algorithm"). One script reads
 * every rule's number, decides, and writes them, so calls arriving together
 * on different instances are counted one after another and none slips
 * through. The clock is Redis's own, so instances can't disagree on it.
 *
 * Redis is reached over HTTPS (Upstash's REST interface), not a socket: an
 * instance that is frozen between requests holds no connection to go stale,
 * and a thousand instances hold no thousand connections.
 *
 * When Redis doesn't answer, the limit's own `withoutRedis` decides. After
 * a few failures in a row, calls stop asking it for a few seconds rather than
 * each waiting in turn; one slow answer, which a flood could cause, is not
 * enough to loosen every limit.
 *
 * Pure but for the fetch: everything is passed in, so it can be tested.
 */

/** One rule, for one subject: what to count under which key. */
export type Charge = {
	key: string;
	count: number;
	periodMs: number;
	cost: number;
};

/** How long to wait, and which charge said so; null when all allow it. */
export type Refusal = { waitMs: number; index: number } | null;

export type Store = { charge(charges: readonly Charge[]): Promise<Refusal> };

export type Verdict =
	| { ok: true }
	| {
			ok: false;
			/** Whole seconds, at least one. */
			retryAfter: number;
			reason: "limit" | "unavailable";
			by: Subject | null;
	  };

/** Rounding in the stored number must not refuse the last allowed call. */
const SLACK_MS = 1;

const SCRIPT = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local wait, index = 0, 0
local full = {}
for i, key in ipairs(KEYS) do
  local count, period, cost = tonumber(ARGV[i * 3 - 2]), tonumber(ARGV[i * 3 - 1]), tonumber(ARGV[i * 3])
  local from = tonumber(redis.call('GET', key) or now)
  if from < now then from = now end
  full[i] = from + period / count * cost
  local over = full[i] - now - period
  if over > ${SLACK_MS} and over > wait then wait, index = over, i end
end
if wait > 0 then return { math.ceil(wait), index - 1 } end
for i, key in ipairs(KEYS) do
  redis.call('SET', key, string.format('%.3f', full[i]), 'PX', math.ceil(full[i] - now) + 1)
end
return { 0, -1 }
`.trim();

/** Upstash's REST interface: one command, as JSON, with a bearer token. */
export function redisStore(options: {
	url: string;
	token: string;
	timeoutMs?: number;
}): Store {
	const { url, token, timeoutMs = 1000 } = options;
	return {
		async charge(charges) {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify([
					"EVAL",
					SCRIPT,
					charges.length,
					...charges.map((c) => c.key),
					...charges.flatMap((c) => [c.count, c.periodMs, c.cost]),
				]),
				cache: "no-store",
				redirect: "error",
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (!response.ok) throw new Error(`Redis answered ${response.status}`);
			const { result } = (await response.json()) as { result?: unknown };
			if (
				!Array.isArray(result) ||
				typeof result[0] !== "number" ||
				typeof result[1] !== "number"
			)
				throw new Error("Redis answered something else");
			return result[0] > 0 ? { waitMs: result[0], index: result[1] } : null;
		},
	};
}

/** One instance's own counts: the same sums, in memory, of bounded size. */
export function memoryStore(
	options: { now?: () => number; maxKeys?: number } = {},
): Store & { size(): number } {
	const { now: clock = Date.now, maxKeys = 10_000 } = options;
	const held = new Map<string, number>();

	function make(room: number, now: number) {
		if (held.size + room <= maxKeys) return;
		for (const [key, full] of held) if (full <= now) held.delete(key);
		// Still too many: the longest-held go first.
		for (const key of held.keys()) {
			if (held.size + room <= maxKeys) break;
			held.delete(key);
		}
	}

	return {
		size: () => held.size,
		async charge(charges) {
			const now = clock();
			const full: number[] = [];
			let wait = 0;
			let index = -1;
			for (const [i, c] of charges.entries()) {
				const from = Math.max(held.get(c.key) ?? now, now);
				const next = from + (c.periodMs / c.count) * c.cost;
				full.push(next);
				const over = next - now - c.periodMs;
				if (over > SLACK_MS && over > wait) {
					wait = over;
					index = i;
				}
			}
			if (wait > 0) return { waitMs: Math.ceil(wait), index };
			make(charges.length, now);
			charges.forEach((c, i) => {
				held.set(c.key, full[i] as number);
			});
			return null;
		},
	};
}

/** Failures in a row before calls stop asking, and how long they then don't. */
const FAILURES = 3;
const REST_MS = 5_000;

export type Limiter = {
	check(
		name: string,
		limit: Limit,
		subjects: Partial<Record<Subject, string>>,
		cost?: number,
	): Promise<Verdict>;
};

/**
 * `shared` null is a site with no Redis set up. In production that is the
 * same as an outage; in development (`alone`) this process is all there is,
 * and its own counts are the whole truth.
 */
export function createLimiter(options: {
	shared: Store | null;
	local?: Store;
	alone?: boolean;
	/** Keys emails and IPs, so neither is stored as itself. */
	secret: string;
	now?: () => number;
	report?: (event: string, detail: Record<string, unknown>) => void;
}): Limiter {
	const { shared, alone = false, secret } = options;
	const now = options.now ?? Date.now;
	const local = options.local ?? memoryStore({ now });
	const report = options.report ?? (() => {});
	let restUntil = 0;
	let failures = 0;
	let saidUnset = false;

	function subjectKey(by: Subject, value: string): string {
		if (by === "site") return "all";
		return createHmac("sha256", secret)
			.update(`${by}:${value}`)
			.digest("base64url")
			.slice(0, 22);
	}

	function charges(
		name: string,
		rules: readonly Rule[],
		subjects: Partial<Record<Subject, string>>,
		cost: number,
	): Charge[] {
		return rules.map((rule, i) => {
			const value = rule.by === "site" ? "all" : subjects[rule.by];
			if (!value) throw new Error(`${name} needs its ${rule.by}`);
			return {
				key: `rl:${name}:${i}:${subjectKey(rule.by, value)}`,
				count: rule.count,
				periodMs: rule.per * 1000,
				cost,
			};
		});
	}

	return {
		async check(name, limit, subjects, cost = 1) {
			const asked = charges(name, limit.rules, subjects, cost);

			const verdict = (refusal: Refusal): Verdict => {
				if (!refusal) return { ok: true };
				const by = limit.rules[refusal.index]?.by ?? null;
				report("rate_limit.refused", { limit: name, by });
				return {
					ok: false,
					retryAfter: Math.max(1, Math.ceil(refusal.waitMs / 1000)),
					reason: "limit",
					by,
				};
			};

			if (shared && now() >= restUntil) {
				try {
					const refusal = await shared.charge(asked);
					failures = 0;
					// Remembered here too, so an outage starts from what this
					// instance has already let through, not from nothing.
					if (!refusal) await local.charge(asked);
					return verdict(refusal);
				} catch (error) {
					failures++;
					// A try after a rest that fails goes straight back to resting.
					if (failures >= FAILURES) restUntil = now() + REST_MS;
					// Its kind only: a message could carry the address.
					report("rate_limit.redis_unavailable", {
						error: error instanceof Error ? error.name : "unknown",
					});
				}
			} else if (!shared && !alone && !saidUnset) {
				saidUnset = true;
				report("rate_limit.redis_not_set_up", {});
			}

			if (limit.withoutRedis === "refuse" && !alone)
				return {
					ok: false,
					retryAfter: Math.max(1, Math.ceil(REST_MS / 1000)),
					reason: "unavailable",
					by: null,
				};
			return verdict(await local.charge(asked));
		},
	};
}

/**
 * An address as the inbox it reaches, for counting only: capitals and a
 * "+tag" don't make it another one.
 */
export function inboxOf(email: string): string {
	const [name = "", host = ""] = email.trim().toLowerCase().split("@");
	return `${name.split("+")[0] || name}@${host}`;
}

/**
 * The network a request came from, for counting only. Vercel writes
 * `x-real-ip` itself, over anything a browser sent. Elsewhere it is what the
 * nearest proxy added, the last entry of `x-forwarded-for`: earlier ones are
 * whatever the sender claims.
 *
 * An IPv6 home has a whole /64 to pick addresses from, so that is what is
 * counted. With no address at all, everyone shares one allowance.
 */
export function networkOf(
	get: (name: string) => string | null,
	onVercel: boolean,
): string {
	const raw = onVercel
		? get("x-real-ip")
		: get("x-forwarded-for")?.split(",").at(-1);
	const ip = (raw ?? "").trim().toLowerCase();
	if (!ip) return "unknown";
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
	if (mapped?.[1]) return mapped[1];
	if (!ip.includes(":")) return ip;
	const [head = "", tail] = ip.split("%")[0]?.split("::") ?? [];
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const gap =
		tail === undefined ? 0 : Math.max(0, 8 - left.length - right.length);
	return [...left, ...Array<string>(gap).fill("0"), ...right]
		.slice(0, 4)
		.map((part) => part.replace(/^0+(?=.)/, ""))
		.join(":");
}
