/**
 * Rate limiter integration tests. They run against a real Postgres database,
 * so they are skipped unless RUN_DB_TESTS=1 and DATABASE_URL points at a
 * disposable database that already has the schema applied. Rows created here
 * use a unique scope prefix and are removed afterwards.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "db";
import { afterAll, describe, expect, it } from "vitest";
import {
	type RateLimitResult,
	type RateLimitRule,
	consumeRateLimit,
	enforceRateLimits,
	rateLimitKey,
} from "./rate-limit";

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeWithDb("rate limiter (database)", () => {
	const prefix = `test-${randomUUID().slice(0, 8)}`;
	const rule = (
		name: string,
		limit: number,
		windowMs = 60_000,
	): RateLimitRule => ({
		scope: `${prefix}:${name}`,
		limit,
		windowMs,
	});

	afterAll(async () => {
		await prisma.rateLimitBucket.deleteMany({
			where: { key: { startsWith: `${prefix}:` } },
		});
		await prisma.$disconnect();
	});

	it("allows up to the limit, then blocks with a retry time", async () => {
		const r = rule("basic", 3);
		const results: RateLimitResult[] = [];
		for (let i = 0; i < 4; i++) {
			results.push(await consumeRateLimit(prisma, r, "203.0.113.7"));
		}
		expect(results.map((x) => x.allowed)).toEqual([true, true, true, false]);
		expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
		expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60);
	});

	it("counts identifiers separately and case-insensitively", async () => {
		const r = rule("separate", 1);
		expect((await consumeRateLimit(prisma, r, "a@example.com")).allowed).toBe(
			true,
		);
		expect((await consumeRateLimit(prisma, r, "A@Example.com")).allowed).toBe(
			false,
		);
		expect((await consumeRateLimit(prisma, r, "b@example.com")).allowed).toBe(
			true,
		);
	});

	it("starts a new window once the old one has expired", async () => {
		const r = rule("reset", 1);
		await consumeRateLimit(prisma, r, "x");
		expect((await consumeRateLimit(prisma, r, "x")).allowed).toBe(false);
		await prisma.rateLimitBucket.update({
			where: { key: rateLimitKey(r.scope, "x") },
			data: { resetAt: new Date(Date.now() - 1000) },
		});
		const fresh = await consumeRateLimit(prisma, r, "x");
		expect(fresh).toMatchObject({ allowed: true, count: 1 });
	});

	it("stores only a hash of the identifier", async () => {
		const r = rule("hashed", 5);
		await consumeRateLimit(prisma, r, "private.person@example.com");
		const rows = await prisma.rateLimitBucket.findMany({
			where: { key: { startsWith: `${r.scope}:` } },
			select: { key: true },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].key).toMatch(new RegExp(`^${r.scope}:[0-9a-f]{64}$`));
		expect(rows[0].key).not.toContain("private.person");
	});

	it("never admits more than the limit under concurrent requests", async () => {
		const r = rule("concurrent", 10);
		const results = await Promise.all(
			Array.from({ length: 30 }, () => consumeRateLimit(prisma, r, "same")),
		);
		expect(results.filter((x) => x.allowed)).toHaveLength(10);
	});

	it("enforceRateLimits throws TOO_MANY_REQUESTS when any rule is exceeded", async () => {
		const loose = rule("enforce-loose", 100);
		const strict = rule("enforce-strict", 1);
		const checks = [
			{ rule: loose, identifier: "id" },
			{ rule: strict, identifier: "id" },
		];
		await expect(enforceRateLimits(prisma, checks)).resolves.toBeUndefined();
		await expect(enforceRateLimits(prisma, checks)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});
	});

	it("treats a missing identifier as one shared bucket (fails closed)", async () => {
		const r = rule("unknown", 1);
		await enforceRateLimits(prisma, [{ rule: r, identifier: null }]);
		await expect(
			enforceRateLimits(prisma, [{ rule: r, identifier: undefined }]),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
	});
});
