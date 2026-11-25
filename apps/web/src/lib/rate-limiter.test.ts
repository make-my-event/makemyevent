import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { LIMITS, type Limit, waitText } from "./limits.ts";
import {
	createLimiter,
	inboxOf,
	memoryStore,
	networkOf,
	redisStore,
	type Store,
} from "./rate-limiter.ts";

const LOCAL: Limit = {
	rules: [{ by: "user", count: 3, per: 30 }],
	withoutRedis: "local",
	says: "Too fast.",
};
const REFUSE: Limit = { ...LOCAL, withoutRedis: "refuse" };

const down: Store = {
	charge: async () => {
		throw new Error("https://secret-host.example refused");
	},
};

function clocked() {
	let at = 1_000_000;
	return {
		now: () => at,
		pass: (ms: number) => {
			at += ms;
		},
	};
}

test("a burst is allowed, the next is refused with the real wait, then refills", async () => {
	const clock = clocked();
	const limiter = createLimiter({
		shared: null,
		alone: true,
		secret: "s",
		now: clock.now,
	});
	const ask = () => limiter.check("t", LOCAL, { user: "a" });
	for (let i = 0; i < 3; i++) assert.deepEqual(await ask(), { ok: true });
	assert.deepEqual(await ask(), {
		ok: false,
		retryAfter: 10,
		reason: "limit",
		by: "user",
	});
	clock.pass(9_000);
	assert.equal((await ask()).ok, false);
	clock.pass(1_000);
	assert.equal((await ask()).ok, true);
	assert.equal((await ask()).ok, false);
	// Another person is not affected.
	assert.equal((await limiter.check("t", LOCAL, { user: "b" })).ok, true);
});

test("a refused call counts against no rule, and a cost counts in full", async () => {
	const limit: Limit = {
		...LOCAL,
		rules: [
			{ by: "user", count: 2, per: 60 },
			{ by: "ip", count: 10, per: 60 },
		],
	};
	const limiter = createLimiter({ shared: null, alone: true, secret: "s" });
	assert.equal(
		(await limiter.check("t", limit, { user: "a", ip: "1" }, 2)).ok,
		true,
	);
	for (let i = 0; i < 50; i++)
		assert.equal(
			(await limiter.check("t", limit, { user: "a", ip: "1" })).ok,
			false,
		);
	// The network's other 8 are still there: the 50 refusals took none.
	for (let i = 0; i < 4; i++)
		assert.equal(
			(await limiter.check("t", limit, { user: `u${i}`, ip: "1" }, 2)).ok,
			true,
		);
	const last = await limiter.check("t", limit, { user: "z", ip: "1" });
	assert.equal(last.ok, false);
	assert.equal(!last.ok && last.by, "ip");
});

test("a subject a rule needs is never silently left out", async () => {
	const limiter = createLimiter({ shared: null, alone: true, secret: "s" });
	await assert.rejects(limiter.check("t", LOCAL, {}), /needs its user/);
});

test("with Redis down, work goes on under this instance's own count", async () => {
	const limiter = createLimiter({ shared: down, secret: "s" });
	for (let i = 0; i < 3; i++)
		assert.equal((await limiter.check("t", LOCAL, { user: "a" })).ok, true);
	const fourth = await limiter.check("t", LOCAL, { user: "a" });
	assert.equal(!fourth.ok && fourth.reason, "limit");
});

test("with Redis down or not set up, what costs money is refused", async () => {
	for (const shared of [down, null]) {
		const limiter = createLimiter({ shared, secret: "s" });
		assert.deepEqual(await limiter.check("t", REFUSE, { user: "a" }), {
			ok: false,
			retryAfter: 5,
			reason: "unavailable",
			by: null,
		});
	}
	// Alone in development, its own count is the whole truth.
	const dev = createLimiter({ shared: null, alone: true, secret: "s" });
	assert.equal((await dev.check("t", REFUSE, { user: "a" })).ok, true);
});

test("one slow answer doesn't stop the shared count, and an outage remembers", async () => {
	let asked = 0;
	const shared = memoryStore();
	const limiter = createLimiter({
		shared: {
			charge: async (charges) => {
				asked++;
				if (asked === 2 || asked > 4) throw new Error("slow");
				return shared.charge(charges);
			},
		},
		secret: "s",
	});
	const ask = () => limiter.check("t", LOCAL, { user: "a" });
	// Shared, then this instance's own, then shared again.
	for (let i = 0; i < 3; i++) await ask();
	assert.equal(asked, 3);
	// What was let through before the outage still counts in it.
	await ask();
	const during = await ask();
	assert.equal(!during.ok && during.reason, "limit");
});

test("a Redis that fails is left alone for a while, then asked again", async () => {
	const clock = clocked();
	let asked = 0;
	const reports: string[] = [];
	const limiter = createLimiter({
		shared: {
			charge: async () => {
				asked++;
				if (asked <= 4) throw new Error("https://secret-host.example");
				return null;
			},
		},
		secret: "s",
		now: clock.now,
		report: (event, detail) => reports.push(JSON.stringify([event, detail])),
	});
	const ask = () => limiter.check("t", REFUSE, { user: "a" });
	// Three failures in a row, then left alone.
	for (let i = 0; i < 20; i++) assert.equal((await ask()).ok, false);
	assert.equal(asked, 3);
	// Still failing after the rest: one try, then left alone again.
	clock.pass(5_000);
	for (let i = 0; i < 20; i++) assert.equal((await ask()).ok, false);
	assert.equal(asked, 4);
	clock.pass(5_000);
	assert.equal((await ask()).ok, true);
	assert.equal(asked, 5);
	// Said each time, without the address.
	assert.equal(reports.length, 4);
	assert.doesNotMatch(reports.join(" "), /secret-host/);
});

test("emails and networks are never stored as themselves", async () => {
	const keys: string[] = [];
	const limiter = createLimiter({
		shared: {
			charge: async (charges) => {
				keys.push(...charges.map((c) => c.key));
				return null;
			},
		},
		secret: "s",
	});
	await limiter.check("signin.email", LIMITS["signin.email"], {
		email: "asha@example.com",
		ip: "203.0.113.9",
	});
	assert.equal(new Set(keys).size, 3);
	assert.doesNotMatch(keys.join(" "), /asha|example|203\.0/);
});

test("memory stays bounded however many come", async () => {
	const clock = clocked();
	const store = memoryStore({ now: clock.now, maxKeys: 100 });
	for (let i = 0; i < 1000; i++)
		await store.charge([{ key: `k${i}`, count: 1, periodMs: 60_000, cost: 1 }]);
	assert.ok(store.size() <= 100);
});

test("a Redis that hangs, fails or talks nonsense is an outage, never an allowance", async () => {
	const answers: Record<string, () => [number, string] | null> = {
		hang: () => null,
		error: () => [500, "{}"],
		denied: () => [401, '{"error":"WRONGPASS"}'],
		script: () => [200, '{"error":"ERR"}'],
		html: () => [200, "<html>"],
		empty: () => [200, '{"result":null}'],
		strings: () => [200, '{"result":["0","-1"]}'],
	};
	const server = createServer((request, response) => {
		const answer = answers[request.url?.slice(1) ?? ""]?.();
		if (!answer) return;
		response.writeHead(answer[0]).end(answer[1]);
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const { port } = server.address() as AddressInfo;
	try {
		for (const name of Object.keys(answers)) {
			const limiter = createLimiter({
				shared: redisStore({
					url: `http://127.0.0.1:${port}/${name}`,
					token: "t",
					timeoutMs: 100,
				}),
				secret: "s",
			});
			const started = performance.now();
			const verdict = await limiter.check("t", REFUSE, { user: "a" });
			assert.equal(!verdict.ok && verdict.reason, "unavailable", name);
			assert.ok(performance.now() - started < 1000, name);
		}
	} finally {
		server.closeAllConnections();
		server.close();
	}
});

test("the network is what the host says, not what the browser claims", () => {
	const from =
		(values: Record<string, string>) =>
		(name: string): string | null =>
			values[name] ?? null;
	assert.equal(
		networkOf(
			from({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }),
			true,
		),
		"203.0.113.9",
	);
	// Off Vercel x-real-ip could be anyone's; the last hop is the proxy's word.
	assert.equal(
		networkOf(
			from({
				"x-real-ip": "9.9.9.9",
				"x-forwarded-for": "1.1.1.1, 203.0.113.9",
			}),
			false,
		),
		"203.0.113.9",
	);
	assert.equal(networkOf(from({}), true), "unknown");
	const v6 = (ip: string) => networkOf(from({ "x-real-ip": ip }), true);
	assert.equal(v6("2001:db8:0:7::1"), "2001:db8:0:7");
	assert.equal(v6("2001:DB8:0:7:aaaa:bbbb:cccc:dddd"), "2001:db8:0:7");
	assert.equal(v6("2001:0db8:0000:0007:0:0:0:2"), "2001:db8:0:7");
	assert.equal(v6("2001:db8::1"), "2001:db8:0:0");
	assert.equal(v6("::ffff:203.0.113.9"), "203.0.113.9");
});

test("an inbox is the same with capitals or a tag", () => {
	assert.equal(inboxOf(" Asha+x@Example.com "), "asha@example.com");
	assert.equal(inboxOf("+only@example.com"), "+only@example.com");
});

test("waits are said in words, never short of the real wait", () => {
	assert.equal(waitText(0), "1 second");
	assert.equal(waitText(40), "40 seconds");
	assert.equal(waitText(61), "2 minutes");
	assert.equal(waitText(3601), "2 hours");
});

test("every limit can be met: its largest call fits each of its rules", () => {
	for (const [name, limit] of Object.entries(LIMITS))
		for (const rule of limit.rules) {
			assert.ok(rule.count >= (name === "passes.send" ? 10 : 1), name);
			assert.ok(rule.per > 0, name);
		}
});
