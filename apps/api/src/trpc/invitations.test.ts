/**
 * Invitation flow integration tests: inviting an email reveals nothing about
 * whether it has an account, and an invitation only becomes access when the
 * invitee (with a verified email) claims it. They run against a real Postgres
 * database, so they are skipped unless RUN_DB_TESTS=1 and DATABASE_URL points
 * at a disposable database that already has the schema applied. Every row the
 * tests create is removed afterwards.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeWithDb("invitations (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const userIds: string[] = [];
	const organizerIds: string[] = [];

	let ownerId: string;
	let organizerId: string;
	let communityId: string;
	let eventId: string;
	const slug = `invites-${suffix}`;

	// Invitees
	let oauthUserId: string; // signed up with Google: email verified
	let unverifiedUserId: string; // password account, email never verified
	let verifiedPasswordUserId: string; // password account, email verified
	const oauthEmail = `oauth-${suffix}@example.com`;
	const unverifiedEmail = `unverified-${suffix}@example.com`;
	const verifiedPasswordEmail = `verified-${suffix}@example.com`;

	const as = (userId: string) =>
		appRouter.createCaller(createContext(userId, null));

	const createUser = async (
		email: string,
		opts: { name?: string; emailVerified?: Date; oauth?: boolean } = {},
	) => {
		const user = await prisma.user.create({
			data: {
				email,
				name: opts.name ?? null,
				emailVerified: opts.emailVerified ?? null,
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

	const volunteerUserId = async (email: string) =>
		(
			await prisma.eventVolunteer.findUniqueOrThrow({
				where: { eventId_email: { eventId, email } },
				select: { userId: true },
			})
		).userId;

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
		unverifiedUserId = await createUser(unverifiedEmail, {
			name: "Unverified",
		});
		verifiedPasswordUserId = await createUser(verifiedPasswordEmail, {
			name: "Verified",
			emailVerified: new Date(),
		});

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
		organizerIds.push(organizerId);

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
		await prisma.organizerMember.deleteMany({
			where: { organizerId: { in: organizerIds } },
		});
		await prisma.organizer.deleteMany({ where: { id: { in: organizerIds } } });
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
			// Not linked to the account at invite time.
			expect(await volunteerUserId(oauthEmail)).toBeNull();
		});

		it("the volunteer list shows no account details for an unclaimed invite", async () => {
			const { volunteers } = await as(ownerId).events.volunteersGet({ slug });
			const row = volunteers.find((v) => v.email === oauthEmail);
			expect(row?.user).toBeNull();
		});

		it("organizers.addMember neither links nor uses the account's own name", async () => {
			const member = await as(ownerId).organizers.addMember({
				organizerId,
				email: oauthEmail,
				role: "EDITOR",
			});
			expect(member).not.toHaveProperty("userId");
			expect(member.name).toBeNull();
			const row = await prisma.organizerMember.findUniqueOrThrow({
				where: { organizerId_email: { organizerId, email: oauthEmail } },
				select: { userId: true, name: true },
			});
			expect(row).toEqual({ userId: null, name: null });
		});

		it("communities.addMember neither links nor uses the account's own name", async () => {
			const member = await as(ownerId).communities.addMember({
				communityId,
				email: oauthEmail,
				role: "ADMIN",
			});
			expect(member).not.toHaveProperty("userId");
			expect(member.name).toBeNull();
			const row = await prisma.communityMember.findUniqueOrThrow({
				where: { communityId_email: { communityId, email: oauthEmail } },
				select: { userId: true },
			});
			expect(row.userId).toBeNull();
		});
	});

	describe("claiming invitations", () => {
		it("gives a verified invitee access after they claim (page load)", async () => {
			// Before claiming: no access to the guest list as a volunteer.
			await expect(
				as(oauthUserId).events.manageGuestsList({ slug }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			const result = await as(oauthUserId).users.claimPendingInvites();
			// Volunteer + organizer member + community member invites.
			expect(result).toEqual({ linked: 3, requiresVerification: false });
			expect(await volunteerUserId(oauthEmail)).toBe(oauthUserId);

			await expect(
				as(oauthUserId).events.manageGuestsList({ slug }),
			).resolves.toHaveProperty("issuedTickets");
		});

		it("is idempotent", async () => {
			await expect(
				as(oauthUserId).users.claimPendingInvites(),
			).resolves.toEqual({ linked: 0, requiresVerification: false });
		});

		it("does not link invites for an unverified email", async () => {
			await inviteVolunteer(unverifiedEmail);

			await expect(
				as(unverifiedUserId).users.claimPendingInvites(),
			).resolves.toEqual({ linked: 0, requiresVerification: true });
			expect(await volunteerUserId(unverifiedEmail)).toBeNull();
			await expect(
				as(unverifiedUserId).events.manageGuestsList({ slug }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("links invites for a password account whose email is verified", async () => {
			await inviteVolunteer(verifiedPasswordEmail);
			await expect(
				as(verifiedPasswordUserId).users.claimPendingInvites(),
			).resolves.toEqual({ linked: 1, requiresVerification: false });
			expect(await volunteerUserId(verifiedPasswordEmail)).toBe(
				verifiedPasswordUserId,
			);
		});

		it("never claims an invite sent to a different email", async () => {
			// The verified user claiming again must not pick up the unverified
			// user's pending invite.
			await as(verifiedPasswordUserId).users.claimPendingInvites();
			expect(await volunteerUserId(unverifiedEmail)).toBeNull();
		});

		it("matches the account email case-insensitively", async () => {
			const mixedId = await createUser(`Mixed.Case-${suffix}@Example.com`, {
				oauth: true,
			});
			await inviteVolunteer(`mixed.case-${suffix}@example.com`);
			await expect(as(mixedId).users.claimPendingInvites()).resolves.toEqual({
				linked: 1,
				requiresVerification: false,
			});
		});

		it("re-inviting an already linked volunteer keeps the link", async () => {
			await inviteVolunteer(oauthEmail, "Renamed");
			expect(await volunteerUserId(oauthEmail)).toBe(oauthUserId);
		});
	});
});
