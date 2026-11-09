/**
 * Account integration tests: sign-up, sign-in checks, email verification,
 * password reset and the Google/GitHub sign-in rule, including the
 * pre-account-takeover scenarios. They run against a real Postgres database,
 * so they are skipped unless RUN_DB_TESTS=1 and DATABASE_URL points at a
 * disposable database that already has the schema applied. Every row the
 * tests create is removed afterwards.
 */
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkCredentials,
	notifySignInMethodLinked,
	passwordProblem,
	prepareOAuthSignIn,
	registerAccount,
	requestPasswordReset,
	resetPassword,
	verifyEmail,
} from "./accounts";

type Sent = {
	kind: "verify" | "reset" | "exists" | "notice";
	toEmail: string;
	token?: string;
	event?: { kind: string };
};
const { sent } = vi.hoisted(() => ({ sent: [] as Sent[] }));
vi.mock("./email.service", () => ({
	sendVerificationEmail: async (p: { toEmail: string; token: string }) => {
		sent.push({ kind: "verify", ...p });
		return null;
	},
	sendPasswordResetEmail: async (p: { toEmail: string; token: string }) => {
		sent.push({ kind: "reset", ...p });
		return null;
	},
	sendAccountExistsEmail: async (p: { toEmail: string }) => {
		sent.push({ kind: "exists", ...p });
		return null;
	},
	sendSecurityNoticeEmail: async (p: {
		toEmail: string;
		event: { kind: string };
	}) => {
		sent.push({ kind: "notice", ...p });
		return null;
	},
}));
// No real Have I Been Pwned calls from tests: one fixed "breached" password.
const BREACHED = "password123456";
vi.mock("./breached-password", () => ({
	isBreachedPassword: async (password: string) => password === "password123456",
}));

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describe("passwordProblem", () => {
	it("requires at least 8 characters and at most 72 bytes", () => {
		expect(passwordProblem("short12")).not.toBeNull();
		expect(passwordProblem("long enough")).toBeNull();
		expect(passwordProblem("é".repeat(37))).not.toBeNull(); // 74 bytes
		expect(passwordProblem("a".repeat(72))).toBeNull();
	});
});

// bcrypt runs at the production cost (12) here on purpose, so these tests
// need more than the default 5s.
describeWithDb("accounts (database)", { timeout: 30_000 }, () => {
	const suffix = randomUUID().slice(0, 8);
	const emails: string[] = [];
	const email = (label: string) => {
		const value = `${label}-${suffix}@example.com`;
		emails.push(value);
		return value;
	};
	// Each check gets its own source IP so rate limits don't interfere.
	const ip = () => randomUUID();
	const lastSent = (to: string, kind: Sent["kind"]) =>
		[...sent].reverse().find((m) => m.toEmail === to && m.kind === kind);
	const noticesTo = (to: string) =>
		sent
			.filter((m) => m.toEmail === to && m.kind === "notice")
			.map((m) => m.event?.kind);
	const user = (address: string) =>
		prisma.user.findUniqueOrThrow({
			where: { email: address },
			select: {
				id: true,
				passwordHash: true,
				emailVerified: true,
				emailVerificationExempt: true,
			},
		});

	beforeEach(() => {
		sent.length = 0;
	});

	afterAll(async () => {
		const users = await prisma.user.findMany({
			where: { email: { in: emails } },
			select: { id: true },
		});
		const ids = users.map((u) => u.id);
		await prisma.session.deleteMany({ where: { userId: { in: ids } } });
		await prisma.account.deleteMany({ where: { userId: { in: ids } } });
		await prisma.user.deleteMany({ where: { id: { in: ids } } });
		await prisma.verificationToken.deleteMany({
			where: { identifier: { endsWith: `-${suffix}@example.com` } },
		});
		await prisma.$disconnect();
	});

	describe("sign-up", () => {
		it("creates an unverified account and emails a verification link (only its hash is stored)", async () => {
			const address = email("new");
			await registerAccount(
				prisma,
				{ name: "New", email: address, password: "password one" },
				ip(),
			);

			const row = await user(address);
			expect(row.emailVerified).toBeNull();
			expect(row.emailVerificationExempt).toBe(false);

			const mail = lastSent(address, "verify");
			expect(mail?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
			const stored = await prisma.verificationToken.findMany({
				where: { identifier: `verify-email:${address}` },
				select: { token: true },
			});
			expect(stored).toEqual([
				{
					token: createHash("sha256")
						.update(mail?.token ?? "")
						.digest("hex"),
				},
			]);
		});

		it("does not reveal or change an existing account: it sends a notice instead", async () => {
			const address = email("existing");
			await registerAccount(
				prisma,
				{ name: "A", email: address, password: "original pw" },
				ip(),
			);
			const before = await user(address);

			await expect(
				registerAccount(
					prisma,
					{ name: "B", email: address, password: "attacker pw" },
					ip(),
				),
			).resolves.toBeUndefined();

			expect(lastSent(address, "exists")).toBeDefined();
			const after = await user(address);
			expect(after.passwordHash).toBe(before.passwordHash);
		});

		it("rejects passwords known from data breaches", async () => {
			const address = email("breached");
			await expect(
				registerAccount(
					prisma,
					{ name: null, email: address, password: BREACHED },
					ip(),
				),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				message: expect.stringContaining("data breach"),
			});
			expect(await prisma.user.count({ where: { email: address } })).toBe(0);
		});

		it("rejects weak passwords", async () => {
			await expect(
				registerAccount(
					prisma,
					{ name: null, email: email("weak"), password: "short" },
					ip(),
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});
	});

	describe("password sign-in", () => {
		it("refuses a new unverified account, but only after the password is correct", async () => {
			const address = email("unverified");
			await registerAccount(
				prisma,
				{ name: null, email: address, password: "right password" },
				ip(),
			);

			await expect(
				checkCredentials(prisma, address, "wrong password", ip()),
			).resolves.toEqual({
				ok: false,
				reason: "invalid",
			});
			await expect(
				checkCredentials(prisma, address, "right password", ip()),
			).resolves.toEqual({
				ok: false,
				reason: "unverified",
			});
		});

		it("lets grandfathered (exempt) and verified accounts sign in", async () => {
			for (const flags of [
				{ emailVerificationExempt: true },
				{ emailVerified: new Date() },
			]) {
				const address = email(`ok-${Object.keys(flags)[0].toLowerCase()}`);
				await prisma.user.create({
					data: {
						email: address,
						passwordHash: await bcrypt.hash("pw secret", 4),
						...flags,
					},
				});
				const result = await checkCredentials(
					prisma,
					address,
					"pw secret",
					ip(),
				);
				expect(result.ok).toBe(true);
			}
		});

		it("treats an unknown email like a wrong password", async () => {
			await expect(
				checkCredentials(prisma, email("nobody"), "anything at all", ip()),
			).resolves.toEqual({ ok: false, reason: "invalid" });
		});

		it("rate limits repeated attempts for one email from one IP", async () => {
			const address = email("limited");
			const source = ip();
			const results: Awaited<ReturnType<typeof checkCredentials>>[] = [];
			for (let i = 0; i < 11; i++) {
				results.push(
					await checkCredentials(prisma, address, `guess ${i}`, source),
				);
			}
			expect(results.at(-1)).toEqual({ ok: false, reason: "rate_limited" });
		});
	});

	describe("email verification", () => {
		it("requires the account's password, and a wrong password does not use up the link", async () => {
			const address = email("verify");
			await registerAccount(
				prisma,
				{ name: null, email: address, password: "my password" },
				ip(),
			);
			const token = lastSent(address, "verify")?.token ?? "";

			await expect(
				verifyEmail(prisma, token, "not my password"),
			).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			expect((await user(address)).emailVerified).toBeNull();

			await verifyEmail(prisma, token, "my password");
			expect((await user(address)).emailVerified).not.toBeNull();
			await expect(
				verifyEmail(prisma, token, "my password"),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		});

		it("pre-registration attack: the real owner cannot be tricked into activating an attacker's password", async () => {
			const address = email("victim");
			// Attacker registers the victim's address with a password they know.
			await registerAccount(
				prisma,
				{ name: null, email: address, password: "attacker secret" },
				ip(),
			);
			const token = lastSent(address, "verify")?.token ?? "";

			// The victim clicks the link but does not know the attacker's password.
			await expect(
				verifyEmail(prisma, token, "victim guess"),
			).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			// The attacker still cannot sign in: the email is unverified.
			await expect(
				checkCredentials(prisma, address, "attacker secret", ip()),
			).resolves.toEqual({ ok: false, reason: "unverified" });

			// The victim takes the account over with a password reset.
			await requestPasswordReset(prisma, address, ip());
			await resetPassword(
				prisma,
				lastSent(address, "reset")?.token ?? "",
				"victim new pw",
			);
			await expect(
				checkCredentials(prisma, address, "attacker secret", ip()),
			).resolves.toEqual({ ok: false, reason: "invalid" });
			expect(
				(await checkCredentials(prisma, address, "victim new pw", ip())).ok,
			).toBe(true);
		});

		it("rejects an expired link", async () => {
			const address = email("expired");
			await registerAccount(
				prisma,
				{ name: null, email: address, password: "pw for expiry" },
				ip(),
			);
			await prisma.verificationToken.updateMany({
				where: { identifier: `verify-email:${address}` },
				data: { expires: new Date(Date.now() - 1000) },
			});
			await expect(
				verifyEmail(
					prisma,
					lastSent(address, "verify")?.token ?? "",
					"pw for expiry",
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});
	});

	describe("password reset", () => {
		it("sends nothing for an unknown email and does not fail", async () => {
			const address = email("ghost");
			await expect(
				requestPasswordReset(prisma, address, ip()),
			).resolves.toBeUndefined();
			expect(lastSent(address, "reset")).toBeUndefined();
		});

		it("sets the password, verifies the email, signs out every session, and works once", async () => {
			const address = email("reset");
			const created = await prisma.user.create({
				data: {
					email: address,
					passwordHash: await bcrypt.hash("old password", 4),
					emailVerificationExempt: true,
					sessions: {
						create: {
							sessionToken: `s-${randomUUID()}`,
							expires: new Date(Date.now() + 864e5),
						},
					},
				},
				select: { id: true },
			});
			await requestPasswordReset(prisma, address, ip());
			const token = lastSent(address, "reset")?.token ?? "";

			await expect(resetPassword(prisma, token, "short")).rejects.toMatchObject(
				{
					code: "BAD_REQUEST",
				},
			);
			await expect(
				resetPassword(prisma, token, BREACHED),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
			await resetPassword(prisma, token, "brand new password");
			expect(noticesTo(address)).toContain("password-reset");

			const row = await user(address);
			expect(row.emailVerified).not.toBeNull();
			expect(row.emailVerificationExempt).toBe(false);
			expect(
				await prisma.session.count({ where: { userId: created.id } }),
			).toBe(0);
			expect(
				(await checkCredentials(prisma, address, "old password", ip())).ok,
			).toBe(false);
			expect(
				(await checkCredentials(prisma, address, "brand new password", ip()))
					.ok,
			).toBe(true);
			await expect(
				resetPassword(prisma, token, "another password"),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		});

		it("a verification token cannot be used as a reset token", async () => {
			const address = email("crosskind");
			await registerAccount(
				prisma,
				{ name: null, email: address, password: "pw cross kind" },
				ip(),
			);
			await expect(
				resetPassword(
					prisma,
					lastSent(address, "verify")?.token ?? "",
					"hijacked password",
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});
	});

	describe("Google/GitHub sign-in", () => {
		it("refuses when the provider does not confirm the email is verified", async () => {
			for (const provider of ["google", "github"]) {
				await expect(
					prepareOAuthSignIn(prisma, {
						provider,
						email: email(`unconfirmed-${provider}`),
						providerEmailVerified: false,
					}),
				).resolves.toBe(false);
			}
		});

		it("removes an unverified password and signs out its sessions (pre-account takeover)", async () => {
			const address = email("planted");
			const planted = await prisma.user.create({
				data: {
					email: address,
					passwordHash: await bcrypt.hash("attacker secret", 4),
					emailVerificationExempt: true,
					sessions: {
						create: {
							sessionToken: `s-${randomUUID()}`,
							expires: new Date(Date.now() + 864e5),
						},
					},
				},
				select: { id: true },
			});

			await expect(
				prepareOAuthSignIn(prisma, {
					provider: "google",
					email: address.toUpperCase(),
					providerEmailVerified: true,
				}),
			).resolves.toBe(true);

			const row = await user(address);
			expect(row.passwordHash).toBeNull();
			expect(row.emailVerified).not.toBeNull();
			expect(
				await prisma.session.count({ where: { userId: planted.id } }),
			).toBe(0);
			expect(noticesTo(address)).toContain("password-removed");
			await expect(
				checkCredentials(prisma, address, "attacker secret", ip()),
			).resolves.toEqual({ ok: false, reason: "invalid" });
		});

		it("notifies when a sign-in is added to an account that already had another way in", async () => {
			const address = email("linked");
			const withPassword = await prisma.user.create({
				data: {
					email: address,
					passwordHash: await bcrypt.hash("owner password", 4),
					emailVerified: new Date(),
				},
				select: { id: true },
			});
			await notifySignInMethodLinked(prisma, withPassword.id, "google");
			expect(noticesTo(address)).toEqual(["sign-in-linked"]);
		});

		it("does not notify for a brand-new Google/GitHub account", async () => {
			const address = email("fresh-oauth");
			const fresh = await prisma.user.create({
				data: {
					email: address,
					accounts: {
						create: {
							type: "oidc",
							provider: "google",
							providerAccountId: `g-${randomUUID()}`,
						},
					},
				},
				select: { id: true },
			});
			await notifySignInMethodLinked(prisma, fresh.id, "google");
			expect(noticesTo(address)).toEqual([]);
		});

		it("leaves a verified password account alone", async () => {
			const address = email("verified-pw");
			const hash = await bcrypt.hash("owner password", 4);
			await prisma.user.create({
				data: { email: address, passwordHash: hash, emailVerified: new Date() },
			});
			await prepareOAuthSignIn(prisma, {
				provider: "github",
				email: address,
				providerEmailVerified: true,
			});
			expect((await user(address)).passwordHash).toBe(hash);
		});
	});
});
