import { describe, expect, it } from "vitest";
import { isVerifiedGitHubEmail } from "./github-email";

const respond =
	(body: unknown, ok = true): typeof fetch =>
	async () =>
		({ ok, json: async () => body }) as Response;

describe("isVerifiedGitHubEmail", () => {
	const emails = [
		{ email: "Owner@Example.com", verified: true, primary: true },
		{ email: "unverified@example.com", verified: false, primary: false },
	];

	it("accepts an address GitHub marks as verified (case-insensitive)", async () => {
		await expect(
			isVerifiedGitHubEmail("token", "owner@example.com", respond(emails)),
		).resolves.toBe(true);
	});

	it("rejects an unverified address, even if it is on the account", async () => {
		await expect(
			isVerifiedGitHubEmail("token", "unverified@example.com", respond(emails)),
		).resolves.toBe(false);
	});

	it("rejects an address that is not on the account", async () => {
		await expect(
			isVerifiedGitHubEmail("token", "someone@example.com", respond(emails)),
		).resolves.toBe(false);
	});

	it("fails closed on errors, bad responses and missing tokens", async () => {
		await expect(
			isVerifiedGitHubEmail(
				"token",
				"owner@example.com",
				respond(emails, false),
			),
		).resolves.toBe(false);
		await expect(
			isVerifiedGitHubEmail(
				"token",
				"owner@example.com",
				respond({ not: "a list" }),
			),
		).resolves.toBe(false);
		await expect(
			isVerifiedGitHubEmail("token", "owner@example.com", async () => {
				throw new Error("network down");
			}),
		).resolves.toBe(false);
		await expect(
			isVerifiedGitHubEmail(undefined, "owner@example.com", respond(emails)),
		).resolves.toBe(false);
	});
});
