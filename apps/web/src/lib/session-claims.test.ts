// @vitest-environment node
import { encode } from "next-auth/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readSessionClaims } from "./session-claims";

const SECRET = "test-secret-for-session-claims";

/** A session cookie exactly as Auth.js would set it (salt = cookie name). */
async function cookieFor(name: string, claims: Record<string, unknown>) {
	const value = await encode({ token: claims, secret: SECRET, salt: name });
	return `${name}=${value}`;
}

const request = (cookie?: string) =>
	new Request("https://app.example.test/api/trpc/x", {
		headers: cookie ? { cookie } : {},
	});

describe("readSessionClaims", () => {
	const original = process.env.AUTH_SECRET;
	beforeAll(() => {
		process.env.AUTH_SECRET = SECRET;
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterAll(() => {
		if (original === undefined) delete process.env.AUTH_SECRET;
		else process.env.AUTH_SECRET = original;
		vi.restoreAllMocks();
	});

	it("reads the session key and sign-in time from the production (__Secure-) cookie", async () => {
		const cookie = await cookieFor("__Secure-authjs.session-token", {
			sub: "user-1",
			sessionToken: "session-key-1",
			authTime: 1_700_000_000_000,
		});
		await expect(readSessionClaims(request(cookie))).resolves.toEqual({
			sessionToken: "session-key-1",
			authTime: 1_700_000_000_000,
		});
	});

	it("reads the development cookie", async () => {
		const cookie = await cookieFor("authjs.session-token", {
			sub: "user-2",
			sessionToken: "session-key-2",
		});
		await expect(readSessionClaims(request(cookie))).resolves.toEqual({
			sessionToken: "session-key-2",
			authTime: null,
		});
	});

	it("rejects a token encrypted with another secret", async () => {
		const forged = `authjs.session-token=${await encode({
			token: { sessionToken: "forged" },
			secret: "attacker-secret",
			salt: "authjs.session-token",
		})}`;
		await expect(readSessionClaims(request(forged))).resolves.toEqual({
			sessionToken: null,
			authTime: null,
		});
	});

	it("returns nothing without a session cookie", async () => {
		await expect(readSessionClaims(request())).resolves.toEqual({
			sessionToken: null,
			authTime: null,
		});
	});
});
