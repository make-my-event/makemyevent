import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { after, before, test } from "node:test";
import { Worker } from "node:worker_threads";
import type { Limit } from "./limits.ts";
import { createLimiter, memoryStore, redisStore } from "./rate-limiter.ts";

/**
 * The shared count, against a real Redis: TEST_REDIS_URL=redis://host:port.
 * The limiter speaks Upstash's REST interface, so a small bridge stands in
 * for Upstash, passing each command on to Redis as it came.
 */

const target = process.env.TEST_REDIS_URL;
const skip = target ? false : "TEST_REDIS_URL is not set";
const TOKEN = "test-token";
let bridge: Server;
let url = "";

/** One command, one connection: the reply as EVAL gives it, [int, int]. */
function command(args: unknown[]): Promise<number[]> {
	const { hostname, port } = new URL(target as string);
	return new Promise((done, fail) => {
		const socket = connect(Number(port || 6379), hostname);
		let reply = "";
		socket.setEncoding("utf8").on("error", fail);
		socket.on("data", (chunk) => {
			reply += chunk;
			if (reply.startsWith("-")) fail(new Error(reply));
			const match = /^\*2\r\n:(-?\d+)\r\n:(-?\d+)\r\n$/.exec(reply);
			if (match) done([Number(match[1]), Number(match[2])]);
			if (match || reply.startsWith("-")) socket.end();
		});
		socket.write(
			`*${args.length}\r\n${args
				.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`)
				.join("")}`,
		);
	});
}

before(async () => {
	if (!target) return;
	bridge = createServer((request, response) => {
		let body = "";
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", async () => {
			try {
				assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);
				const result = await command(JSON.parse(body));
				response.end(JSON.stringify({ result }));
			} catch (error) {
				response.writeHead(400).end(JSON.stringify({ error: String(error) }));
			}
		});
	});
	await new Promise<void>((done) => bridge.listen(0, "127.0.0.1", done));
	url = `http://127.0.0.1:${(bridge.address() as AddressInfo).port}`;
});

after(() => {
	bridge?.closeAllConnections();
	bridge?.close();
});

const store = () => redisStore({ url, token: TOKEN, timeoutMs: 10_000 });

test("eight instances at once let through exactly the limit", {
	skip,
}, async () => {
	const run = randomUUID();
	// Each worker is its own thread with its own copy of everything, as
	// serverless instances are: only Redis is shared.
	const source = `
		import { parentPort, workerData } from "node:worker_threads";
		const { createLimiter, redisStore } = await import(workerData.module);
		const limiter = createLimiter({
			shared: redisStore({ url: workerData.url, token: workerData.token, timeoutMs: 10000 }),
			secret: "s",
		});
		const limit = { rules: [{ by: "user", count: 40, per: 3600 }], withoutRedis: "refuse", says: "" };
		const verdicts = await Promise.all(
			Array.from({ length: 25 }, () => limiter.check(workerData.run, limit, { user: "a" })),
		);
		parentPort.postMessage({
			passed: verdicts.filter((v) => v.ok).length,
			unavailable: verdicts.filter((v) => !v.ok && v.reason === "unavailable").length,
		});
	`;
	const results = await Promise.all(
		Array.from(
			{ length: 8 },
			() =>
				new Promise<{ passed: number; unavailable: number }>((done, fail) => {
					const worker = new Worker(
						new URL(`data:text/javascript,${encodeURIComponent(source)}`),
						{
							workerData: {
								module: new URL("./rate-limiter.ts", import.meta.url).href,
								url,
								token: TOKEN,
								run,
							},
						},
					);
					worker.once("message", done).once("error", fail);
				}),
		),
	);
	assert.equal(
		results.reduce((sum, r) => sum + r.unavailable, 0),
		0,
	);
	// 200 calls, 40 allowed, however they interleave.
	assert.equal(
		results.reduce((sum, r) => sum + r.passed, 0),
		40,
	);
});

test("costs at once never pass the ceiling, across people and networks", {
	skip,
}, async () => {
	const limit: Limit = {
		rules: [
			{ by: "user", count: 100, per: 3600 },
			{ by: "site", count: 250, per: 3600 },
		],
		withoutRedis: "refuse",
		says: "",
	};
	const run = randomUUID();
	const limiters = Array.from({ length: 6 }, () =>
		createLimiter({ shared: store(), secret: "s" }),
	);
	const verdicts = await Promise.all(
		Array.from({ length: 60 }, (_, i) =>
			limiters[i % 6]?.check(run, limit, { user: `u${i % 5}` }, 10),
		),
	);
	assert.equal(verdicts.filter((v) => v?.ok).length, 25);
});

test("a refusal takes nothing, says who and how long, and refills on Redis's clock", {
	skip,
}, async () => {
	const limit: Limit = {
		rules: [
			{ by: "user", count: 2, per: 2 },
			{ by: "ip", count: 5, per: 3600 },
		],
		withoutRedis: "refuse",
		says: "",
	};
	const run = randomUUID();
	const limiter = createLimiter({ shared: store(), secret: "s" });
	const ask = () => limiter.check(run, limit, { user: "a", ip: "1" });
	assert.equal((await ask()).ok, true);
	assert.equal((await ask()).ok, true);
	for (let i = 0; i < 10; i++) {
		const refused = await ask();
		assert.equal(!refused.ok && refused.by, "user");
		assert.equal(!refused.ok && refused.retryAfter, 1);
	}
	await new Promise((done) => setTimeout(done, 1100));
	assert.equal((await ask()).ok, true);
	// Two more on the network's five: the ten refusals cost it nothing.
	assert.equal(
		(await limiter.check(run, limit, { user: "b", ip: "1" }, 2)).ok,
		true,
	);
	assert.equal(
		(await limiter.check(run, limit, { user: "c", ip: "1" })).ok,
		false,
	);
});

test("Redis and the in-memory count agree, call by call", {
	skip,
}, async () => {
	const key = randomUUID();
	const shared = store();
	const local = memoryStore();
	for (let i = 0; i < 60; i++) {
		const charge = [{ key, count: 7, periodMs: 3_600_000, cost: (i % 3) + 1 }];
		const [a, b] = [await shared.charge(charge), await local.charge(charge)];
		assert.equal(a === null, b === null, `call ${i}`);
	}
});
