/**
 * users.changePassword integration tests: other sessions are signed out, the
 * current one stays, a notice is sent, and breached passwords are refused.
 * They run against a real Postgres database, so they are skipped unless
 * RUN_DB_TESTS=1 and DATABASE_URL points at a disposable database that
 * already has the schema applied. Every row the tests create is removed
 * afterwards.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

const { notices } = vi.hoisted(() => ({
	notices: [] as Array<{ toEmail: string; event: { kind: string } }>,
}));
vi.mock("../services/email.service", () => ({
	sendSecurityNoticeEmail: async (p: {
		toEmail: string;
		event: { kind: string };
	}) => {
		notices.push(p);
		return null;
	},
}));
vi.mock("../services/breached-password", () => ({
	isBreachedPassword: async (password: string) => password === "password123456",
}));

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeWithDb("users.changePassword (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const email = `change-pw-${suffix}@example.com`;
	const currentToken = `current-${randomUUID()}`;
	const otherToken = `other-${randomUUID()}`;
	let userId: string;

	const caller = () =>
		appRouter.createCaller(
			createContext(userId, currentToken, null, randomUUID()),
		);

	beforeAll(async () => {
		const expires = new Date(Date.now() + 864e5);
		const user = await prisma.user.create({
			data: {
				email,
				passwordHash: await bcrypt.hash("old password here", 4),
				emailVerified: new Date(),
				sessions: {
					create: [
						{ sessionToken: currentToken, expires },
						{ sessionToken: otherToken, expires },
					],
				},
			},
			select: { id: true },
		});
		userId = user.id;
	});

	afterAll(async () => {
		await prisma.session.deleteMany({ where: { userId } });
		await prisma.user.deleteMany({ where: { id: userId } });
		await prisma.$disconnect();
	});

	it("refuses a breached password and changes nothing", async () => {
		await expect(
			caller().users.changePassword({
				currentPassword: "old password here",
				newPassword: "password123456",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		const row = await prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: { passwordHash: true },
		});
		expect(
			await bcrypt.compare("old password here", row.passwordHash ?? ""),
		).toBe(true);
		expect(await prisma.session.count({ where: { userId } })).toBe(2);
	});

	it("changes the password, signs out other sessions, keeps this one, and notifies", async () => {
		await caller().users.changePassword({
			currentPassword: "old password here",
			newPassword: "a new strong password",
		});

		const sessions = await prisma.session.findMany({
			where: { userId },
			select: { sessionToken: true },
		});
		expect(sessions.map((s) => s.sessionToken)).toEqual([currentToken]);

		const row = await prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: { passwordHash: true },
		});
		expect(
			await bcrypt.compare("a new strong password", row.passwordHash ?? ""),
		).toBe(true);
		expect(notices).toEqual([
			{ toEmail: email, event: { kind: "password-changed" } },
		]);
	});
});

describeWithDb(
	"users.changePassword: first password needs a recent sign-in (database)",
	() => {
		const suffix = randomUUID().slice(0, 8);
		const email = `first-pw-${suffix}@example.com`;
		const sessionToken = `first-${randomUUID()}`;
		let userId: string;

		const callerSignedInAt = (authTime: number | null) =>
			appRouter.createCaller(
				createContext(userId, sessionToken, null, randomUUID(), authTime),
			);
		const setFirstPassword = (authTime: number | null) =>
			callerSignedInAt(authTime).users.changePassword({
				newPassword: "first password set",
			});

		beforeAll(async () => {
			const user = await prisma.user.create({
				data: {
					email,
					emailVerified: new Date(),
					sessions: {
						create: { sessionToken, expires: new Date(Date.now() + 864e5) },
					},
				},
				select: { id: true },
			});
			userId = user.id;
		});

		afterAll(async () => {
			await prisma.session.deleteMany({ where: { userId } });
			await prisma.user.deleteMany({ where: { id: userId } });
		});

		it("refuses without a known sign-in time", async () => {
			await expect(setFirstPassword(null)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
		});

		it("refuses when the sign-in was more than 10 minutes ago", async () => {
			await expect(
				setFirstPassword(Date.now() - 11 * 60 * 1000),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			const row = await prisma.user.findUniqueOrThrow({
				where: { id: userId },
				select: { passwordHash: true },
			});
			expect(row.passwordHash).toBeNull();
		});

		it("allows it right after signing in", async () => {
			await expect(setFirstPassword(Date.now() - 60 * 1000)).resolves.toEqual({
				success: true,
			});
			const row = await prisma.user.findUniqueOrThrow({
				where: { id: userId },
				select: { passwordHash: true },
			});
			expect(row.passwordHash).not.toBeNull();
		});
	},
);
