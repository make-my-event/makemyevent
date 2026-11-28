import "server-only";

/**
 * A few seconds' memory of an answer, shared by every server instance
 * through Redis (Upstash's REST interface, the same pair as the rate
 * limits). For counts read by many screens at once, so the database works
 * them out once per few seconds rather than once per screen.
 *
 * Only for answers that are fine a few seconds old, and only after the
 * caller has checked the person may see them: the cache knows nothing of
 * who asks. Without Redis (local work, or not set up) each instance keeps
 * its own; when Redis doesn't answer, it's a miss and the caller asks the
 * database.
 */

type Entry = { value: string; until: number };

const LOCAL_MAX = 500;
const TIMEOUT_MS = 500;

const globalForCache = globalThis as unknown as {
	sharedCache?: Map<string, Entry>;
};
if (!globalForCache.sharedCache) globalForCache.sharedCache = new Map();
const local: Map<string, Entry> = globalForCache.sharedCache;

function upstash(): { url: string; token: string } | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	return url && token ? { url, token } : null;
}

async function command(args: (string | number)[]): Promise<unknown> {
	const set = upstash();
	if (!set) throw new Error("no redis");
	const response = await fetch(set.url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${set.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(args),
		cache: "no-store",
		redirect: "error",
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`Redis answered ${response.status}`);
	return ((await response.json()) as { result?: unknown }).result;
}

function report(error: unknown) {
	console.error(
		JSON.stringify({
			event: "shared_cache.redis_unavailable",
			message: error instanceof Error ? error.message : String(error),
		}),
	);
}

const keyOf = (key: string) => `cache:${key}`;

async function read(key: string): Promise<string | null> {
	if (!upstash()) {
		const hit = local.get(key);
		if (hit && hit.until > Date.now()) return hit.value;
		local.delete(key);
		return null;
	}
	try {
		const result = await command(["GET", keyOf(key)]);
		return typeof result === "string" ? result : null;
	} catch (error) {
		report(error);
		return null;
	}
}

async function write(key: string, value: string, ttlMs: number) {
	if (!upstash()) {
		if (local.size >= LOCAL_MAX) {
			const oldest = local.keys().next().value;
			if (oldest !== undefined) local.delete(oldest);
		}
		local.set(key, { value, until: Date.now() + ttlMs });
		return;
	}
	try {
		await command(["SET", keyOf(key), value, "PX", ttlMs]);
	} catch (error) {
		report(error);
	}
}

/**
 * The remembered answer for `key` if `accept` takes it, else `work`'s,
 * remembered for `ttlMs`. `accept` checks the shape of what was stored
 * (and anything else, such as which day it was for).
 */
export async function remembered<T>(
	key: string,
	ttlMs: number,
	accept: (stored: unknown) => stored is T,
	work: () => Promise<T>,
): Promise<T> {
	const raw = await read(key);
	if (raw !== null) {
		try {
			const stored: unknown = JSON.parse(raw);
			if (accept(stored)) return stored;
		} catch {
			// Not ours, or damaged: worked out again below.
		}
	}
	const fresh = await work();
	await write(key, JSON.stringify(fresh), ttlMs);
	return fresh;
}

/** Forgets `key`, so the next read works it out again. */
export async function forget(key: string): Promise<void> {
	if (!upstash()) {
		local.delete(key);
		return;
	}
	try {
		await command(["DEL", keyOf(key)]);
	} catch (error) {
		report(error);
	}
}
