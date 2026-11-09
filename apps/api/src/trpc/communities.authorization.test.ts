/**
 * Authorization integration tests for the communities router. They run
 * against a real Postgres database, so they are skipped unless RUN_DB_TESTS=1
 * and DATABASE_URL points at a disposable database that already has the schema
 * applied. Every row the tests create is removed afterwards.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeWithDb("communities authorization (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const userIds: string[] = [];
	const organizerIds: string[] = [];
	const communityIds: string[] = [];

	let attackerId: string;
	let victimCommunityId: string;
	let attackerCommunityId: string;

	const as = (userId: string) =>
		appRouter.createCaller(createContext(userId, null, null, randomUUID()));

	const createOwnedCommunity = async (label: string) => {
		const user = await prisma.user.create({
			data: { email: `${label}-${suffix}@example.com`, name: label },
			select: { id: true },
		});
		userIds.push(user.id);
		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Org ${label} ${suffix}`,
				slug: `org-${label}-${suffix}`,
				ownerId: user.id,
			},
			select: { id: true },
		});
		organizerIds.push(org.id);
		const community = await prisma.community.create({
			data: {
				organizerId: org.id,
				name: `Community ${label}`,
				slug: `community-${label}-${suffix}`,
				members: {
					create: {
						userId: user.id,
						email: `${label}-${suffix}@example.com`,
						role: "OWNER",
					},
				},
			},
			select: { id: true },
		});
		communityIds.push(community.id);
		return { userId: user.id, communityId: community.id };
	};

	const addMember = (communityId: string, label: string) =>
		prisma.communityMember.create({
			data: {
				communityId,
				email: `${label}-${randomUUID()}@example.com`,
				role: "ADMIN",
			},
			select: { id: true },
		});

	beforeAll(async () => {
		const victim = await createOwnedCommunity("victim");
		const attacker = await createOwnedCommunity("attacker");
		victimCommunityId = victim.communityId;
		attackerId = attacker.userId;
		attackerCommunityId = attacker.communityId;
	});

	afterAll(async () => {
		await prisma.communityMember.deleteMany({
			where: { communityId: { in: communityIds } },
		});
		await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
		await prisma.organizer.deleteMany({ where: { id: { in: organizerIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await prisma.$disconnect();
	});

	describe("removeMember", () => {
		it("cannot remove a member of another community by passing a community the caller manages", async () => {
			const victimMember = await addMember(victimCommunityId, "victim-admin");

			await expect(
				as(attackerId).communities.removeMember({
					communityId: attackerCommunityId,
					memberId: victimMember.id,
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });

			const stillThere = await prisma.communityMember.count({
				where: { id: victimMember.id },
			});
			expect(stillThere).toBe(1);
		});

		it("removes a member of the caller's own community", async () => {
			const ownMember = await addMember(attackerCommunityId, "own-admin");

			await expect(
				as(attackerId).communities.removeMember({
					communityId: attackerCommunityId,
					memberId: ownMember.id,
				}),
			).resolves.toEqual({ success: true });

			const remaining = await prisma.communityMember.count({
				where: { id: ownMember.id },
			});
			expect(remaining).toBe(0);
		});
	});
});
