import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isBreachedPassword } from "./breached-password";

const PASSWORD = "correct horse battery staple";
const SHA1 = createHash("sha1").update(PASSWORD).digest("hex").toUpperCase();
const PREFIX = SHA1.slice(0, 5);
const SUFFIX = SHA1.slice(5);

/** A fake fetch that records requested URLs and returns `body`. */
function fakeFetch(body: string, ok = true) {
	const urls: string[] = [];
	const impl = (async (url: string | URL | Request) => {
		urls.push(String(url));
		return { ok, status: ok ? 200 : 503, text: async () => body } as Response;
	}) as typeof fetch;
	return { impl, urls };
}

describe("isBreachedPassword", () => {
	beforeAll(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterAll(() => {
		vi.restoreAllMocks();
	});

	it("sends only the 5-character hash prefix, never the password or full hash", async () => {
		const { impl, urls } = fakeFetch("");
		await isBreachedPassword(PASSWORD, impl);
		expect(urls).toEqual([`https://api.pwnedpasswords.com/range/${PREFIX}`]);
		expect(urls[0]).not.toContain(SUFFIX);
		expect(urls[0]).not.toContain(encodeURIComponent(PASSWORD));
	});

	it("detects a password whose suffix is listed with a positive count", async () => {
		const { impl } = fakeFetch(
			`0000000000000000000000000000000000A:2\r\n${SUFFIX}:42\r\n`,
		);
		await expect(isBreachedPassword(PASSWORD, impl)).resolves.toBe(true);
	});

	it("ignores padding entries (count 0) and other suffixes", async () => {
		const { impl } = fakeFetch(
			`${SUFFIX}:0\r\n0000000000000000000000000000000000B:7\r\n`,
		);
		await expect(isBreachedPassword(PASSWORD, impl)).resolves.toBe(false);
	});

	it("does not block when the service is unavailable", async () => {
		await expect(
			isBreachedPassword(PASSWORD, fakeFetch("", false).impl),
		).resolves.toBe(false);
		await expect(
			isBreachedPassword(PASSWORD, (async () => {
				throw new Error("network down");
			}) as typeof fetch),
		).resolves.toBe(false);
	});
});
