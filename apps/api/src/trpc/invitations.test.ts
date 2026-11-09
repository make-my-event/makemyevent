/**
 * Invitation flow integration tests. Inviting an email reveals nothing about
 * whether it has an account; invitations are single-use, hashed, expiring
 * links that must be accepted explicitly; in-app invitations only match a
 * verified email. They run against a real Postgres database, so they are
 * skipped unless RUN_DB_TESTS=1 and DATABASE_URL points at a disposable
 * database that already has the schema applied. Every row the tests create is
 * removed afterwards.
 */
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { InviteEmailParams } from "../services/email.service";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

// Capture invitation emails instead of sending them: the link in the email is
// the only place the raw token exists, exactly as for a real invitee.
const { sentInvites } = vi.hoisted(() => ({
	sentInvites: [] as InviteEmailParams[],
}));
vi.mock("../services/email.service", () => ({
	sendInviteEmail: async (params: InviteEmailParams) => {
		sentInvites.push(params);
		return null;
	},
	sendTicketEmail: async () => null,
}));

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");

describeWithDb("invitations (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const userIds: string[] = [];

	let ownerId: string;
	let organizerId: string;
	let communityId: string;
	let eventId: string;
	const slug = `invites-${suffix}`;

	let oauthUserId: string; // Google sign-in: email verified
	let passwordUserId: string; // password account, email not verified
	const oauthEmail = `oauth-${suffix}@example.com`;
	const passwordEmail = `password-${suffix}@example.com`;

	const as = (userId: string) =>
		appRouter.createCaller(createContext(userId, null, null, randomUUID()));
	const anonymous = () =>
		appRouter.createCaller(createContext(null, null, null, randomUUID()));

	const createUser = async (
		email: string,
		opts: { name?: string; oauth?: boolean } = {},
	) => {
		const user = await prisma.user.create({
			data: {
				email,
				name: opts.name ?? null,
				...(opts.oauth
					? {
							accounts: {
								create: {
									type: "oidc",
									provider: "google",
									providerAccountId: `google-${randomUUID()}`,
								},
							},
						}
					: {}),
			},
			select: { id: true },
		});
		userIds.push(user.id);
		return user.id;
	};

	/** Raw token from the most recent invitation email sent to `email`. */
	const lastTokenFor = (email: string): string => {
		const mail = [...sentInvites].reverse().find((m) => m.toEmail === email);
		const match = mail?.actionUrl.match(/\/invite\/([A-Za-z0-9_-]+)$/);
		if (!match) throw new Error(`no invitation link sent to ${email}`);
		return match[1];
	};

	const volunteer = (email: string) =>
		prisma.eventVolunteer.findUnique({
			where: { eventId_email: { eventId, email } },
			select: { userId: true, inviteTokenHash: true, inviteExpiresAt: true },
		});

	const inviteVolunteer = (email: string, name = "Invitee") =>
		as(ownerId).events.volunteersAdd({ slug, name, email, role: "Volunteer" });

	beforeAll(async () => {
		ownerId = await createUser(`owner-${suffix}@example.com`, {
			name: "Owner",
		});
		oauthUserId = await createUser(oauthEmail, {
			name: "Real Account Name",
			oauth: true,
		});
		passwordUserId = await createUser(passwordEmail, { name: "Password" });

		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Invites ${suffix}`,
				slug: `invites-org-${suffix}`,
				ownerId,
			},
			select: { id: true },
		});
		organizerId = org.id;

		const community = await prisma.community.create({
			data: {
				organizerId,
				name: "Invites community",
				slug: `invites-community-${suffix}`,
			},
			select: { id: true },
		});
		communityId = community.id;

		const event = await prisma.event.create({
			data: {
				title: "Invites event",
				slug,
				status: "published",
				eventStart: new Date(Date.now() + 7 * 864e5),
				eventEnd: new Date(Date.now() + 8 * 864e5),
				organizerId,
			},
			select: { id: true },
		});
		eventId = event.id;
	});

	afterAll(async () => {
		await prisma.eventVolunteer.deleteMany({ where: { eventId } });
		await prisma.event.deleteMany({ where: { id: eventId } });
		await prisma.communityMember.deleteMany({ where: { communityId } });
		await prisma.community.deleteMany({ where: { id: communityId } });
		await prisma.organizerMember.deleteMany({ where: { organizerId } });
		await prisma.organizer.deleteMany({ where: { id: organizerId } });
		await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await prisma.$disconnect();
	});

	describe("inviting an email reveals nothing about the account", () => {
		it("volunteersAdd responds identically for an existing account and an unknown email", async () => {
			const existing = await inviteVolunteer(oauthEmail, "Typed Name");
			const unknown = await inviteVolunteer(
				`nobody-${suffix}@example.com`,
				"Typed Name",
			);
			expect(Object.keys(existing).sort()).toEqual(Object.keys(unknown).sort());
			expect(existing).not.toHaveProperty("userId");
			expect(existing).not.toHaveProperty("user");
			expect(existing.name).toBe("Typed Name");
			expect((await volunteer(oauthEmail))?.userId).toBeNull();
		});

		it("the volunteer list shows no account details for a pending invitation", async () => {
			const { volunteers } = await as(ownerId).events.volunteersGet({ slug });
			expect(volunteers.find((v) => v.email === oauthEmail)?.user).toBeNull();
		});

		it("organizers.addMember neither links nor copies the account's name", async () => {
			const member = await as(ownerId).organizers.addMember({
				organizerId,
				email: oauthEmail,
				role: "EDITOR",
			});
			expect(member).not.toHaveProperty("userId");
			expect(member.name).toBeNull();
		});

		it("communities.addMember neither links nor copies the account's name", async () => {
			const member = await as(ownerId).communities.addMember({
				communityId,
				email: oauthEmail,
				role: "ADMIN",
			});
			expect(member).not.toHaveProperty("userId");
			expect(member.name).toBeNull();
		});
	});

	describe("invitation links", () => {
		it("stores only a hash of the emailed token, with a 7-day expiry", async () => {
			await inviteVolunteer(passwordEmail);
			const token = lastTokenFor(passwordEmail);
			const row = await volunteer(passwordEmail);

			expect(token.length).toBeGreaterThanOrEqual(43);
			expect(row?.inviteTokenHash).toBe(sha256(token));
			expect(row?.inviteTokenHash).not.toContain(token);
			const days =
				((row?.inviteExpiresAt?.getTime() ?? 0) - Date.now()) / 864e5;
			expect(days).toBeGreaterThan(6.9);
			expect(days).toBeLessThanOrEqual(7);
		});

		it("previews the invitation without exposing the full email", async () => {
			const preview = await anonymous().invites.getByToken({
				token: lastTokenFor(passwordEmail),
			});
			expect(preview).toMatchObject({
				kind: "event",
				targetName: "Invites event",
				expired: false,
			});
			expect(preview.emailHint).toBe(`p***@example.com`);
			expect(JSON.stringify(preview)).not.toContain(passwordEmail);
		});

		it("does nothing until the invitee accepts", async () => {
			expect((await volunteer(passwordEmail))?.userId).toBeNull();
			await expect(
				as(passwordUserId).events.manageGuestsList({ slug }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("can be accepted once, by any signed-in account (the link proves inbox access)", async () => {
			const token = lastTokenFor(passwordEmail);
			// passwordUserId's email is unverified: the link itself is the proof.
			await expect(
				as(passwordUserId).invites.acceptByToken({ token }),
			).resolves.toEqual({ targetPath: `/events/${slug}` });

			const row = await volunteer(passwordEmail);
			expect(row).toEqual({
				userId: passwordUserId,
				inviteTokenHash: null,
				inviteExpiresAt: null,
			});
			await expect(
				as(passwordUserId).events.manageGuestsList({ slug }),
			).resolves.toHaveProperty("issuedTickets");

			// Single use.
			await expect(
				as(oauthUserId).invites.acceptByToken({ token }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("re-inviting a pending address replaces the previous link", async () => {
			const email = `reinvite-${suffix}@example.com`;
			await inviteVolunteer(email);
			const first = lastTokenFor(email);
			await inviteVolunteer(email);
			const second = lastTokenFor(email);

			expect(second).not.toBe(first);
			await expect(
				anonymous().invites.getByToken({ token: first }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			await expect(
				anonymous().invites.getByToken({ token: second }),
			).resolves.toHaveProperty("kind", "event");
		});

		it("rejects an expired link and does not link the account", async () => {
			const email = `expired-${suffix}@example.com`;
			await inviteVolunteer(email);
			const token = lastTokenFor(email);
			await prisma.eventVolunteer.update({
				where: { eventId_email: { eventId, email } },
				data: { inviteExpiresAt: new Date(Date.now() - 1000) },
			});

			await expect(
				anonymous().invites.getByToken({ token }),
			).resolves.toHaveProperty("expired", true);
			await expect(
				as(oauthUserId).invites.acceptByToken({ token }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect((await volunteer(email))?.userId).toBeNull();
		});

		it("can be declined, which removes the pending invitation", async () => {
			const email = `decline-${suffix}@example.com`;
			await inviteVolunteer(email);
			await expect(
				anonymous().invites.declineByToken({ token: lastTokenFor(email) }),
			).resolves.toEqual({ declined: true });
			expect(await volunteer(email)).toBeNull();
		});

		it("rejects unknown tokens", async () => {
			await expect(
				anonymous().invites.getByToken({ token: "x".repeat(43) }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("re-inviting an accepted member keeps the link and sends no new token", async () => {
			await inviteVolunteer(passwordEmail, "Renamed");
			const row = await volunteer(passwordEmail);
			expect(row?.userId).toBe(passwordUserId);
			expect(row?.inviteTokenHash).toBeNull();
			const last = [...sentInvites]
				.reverse()
				.find((m) => m.toEmail === passwordEmail);
			expect(last?.actionUrl).not.toContain("/invite/");
			expect(last?.expiresInDays).toBeUndefined();
		});
	});

	describe("in-app invitations", () => {
		it("lists pending invitations for a verified email without joining automatically", async () => {
			const mine = await as(oauthUserId).invites.listMine();
			expect(mine.map((i) => i.kind).sort()).toEqual([
				"community",
				"event",
				"organization",
			]);
			expect((await volunteer(oauthEmail))?.userId).toBeNull();
		});

		it("accepts one explicitly", async () => {
			const event = (await as(oauthUserId).invites.listMine()).find(
				(i) => i.kind === "event",
			);
			await expect(
				as(oauthUserId).invites.respond({
					kind: "event",
					id: event?.id ?? "",
					accept: true,
				}),
			).resolves.toEqual({ targetPath: `/events/${slug}` });
			expect((await volunteer(oauthEmail))?.userId).toBe(oauthUserId);
		});

		it("declines one explicitly", async () => {
			const org = (await as(oauthUserId).invites.listMine()).find(
				(i) => i.kind === "organization",
			);
			await as(oauthUserId).invites.respond({
				kind: "organization",
				id: org?.id ?? "",
				accept: false,
			});
			const row = await prisma.organizerMember.findUnique({
				where: { organizerId_email: { organizerId, email: oauthEmail } },
				select: { id: true },
			});
			expect(row).toBeNull();
		});

		it("shows nothing to an unverified email and refuses to accept for it", async () => {
			const email = `unverified-match-${suffix}@example.com`;
			const userId = await createUser(email);
			await inviteVolunteer(email);
			const pendingId = (
				await prisma.eventVolunteer.findUniqueOrThrow({
					where: { eventId_email: { eventId, email } },
					select: { id: true },
				})
			).id;

			await expect(as(userId).invites.listMine()).resolves.toEqual([]);
			await expect(
				as(userId).invites.respond({
					kind: "event",
					id: pendingId,
					accept: true,
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect((await volunteer(email))?.userId).toBeNull();
		});

		it("refuses to accept an invitation addressed to someone else", async () => {
			const email = `someone-else-${suffix}@example.com`;
			await inviteVolunteer(email);
			const id = (
				await prisma.eventVolunteer.findUniqueOrThrow({
					where: { eventId_email: { eventId, email } },
					select: { id: true },
				})
			).id;
			await expect(
				as(oauthUserId).invites.respond({ kind: "event", id, accept: true }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect((await volunteer(email))?.userId).toBeNull();
		});

		it("does not list expired invitations", async () => {
			await prisma.communityMember.update({
				where: { communityId_email: { communityId, email: oauthEmail } },
				data: { inviteExpiresAt: new Date(Date.now() - 1000) },
			});
			const mine = await as(oauthUserId).invites.listMine();
			expect(mine.find((i) => i.kind === "community")).toBeUndefined();
		});
	});
});
