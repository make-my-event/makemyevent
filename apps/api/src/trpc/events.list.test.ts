/**
 * Integration tests for the public `events.list` query. They run against a
 * real Postgres database, so they are skipped unless RUN_DB_TESTS=1 and
 * DATABASE_URL points at a disposable database that already has the schema
 * applied. Every row the tests create is removed afterwards.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeWithDb("events.list (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const slug = `list-tiers-${suffix}`;
	const visitor = () => appRouter.createCaller(createContext(null, null));
	let ownerId: string;
	let organizerId: string;

	beforeAll(async () => {
		const owner = await prisma.user.create({
			data: { email: `list-owner-${suffix}@example.com`, name: "Owner" },
		});
		ownerId = owner.id;
		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `List Org ${suffix}`,
				slug: `list-org-${suffix}`,
				ownerId,
			},
		});
		organizerId = org.id;

		const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
		await prisma.event.create({
			data: {
				title: "List tiers",
				slug,
				status: "published",
				eventStart: start,
				eventEnd: new Date(start.getTime() + 3 * 3600 * 1000),
				organizerId,
				tickets: {
					create: [
						{ name: "VIP", price: 900, isPublished: true, order: 0 },
						{ name: "Hidden comp", price: 0, isPublished: false, order: 1 },
						{ name: "General", price: 499, isPublished: true, order: 2 },
					],
				},
			},
		});
	});

	afterAll(async () => {
		await prisma.event.deleteMany({ where: { slug } });
		await prisma.organizer.deleteMany({ where: { id: organizerId } });
		await prisma.user.deleteMany({ where: { id: ownerId } });
		await prisma.$disconnect();
	});

	it("never returns unpublished ticket tiers to the public", async () => {
		const event = (await visitor().events.list()).find((e) => e.slug === slug);

		expect(event?.tickets.map((t) => t.name)).not.toContain("Hidden comp");
		expect(event?.tickets).toHaveLength(2);
	});

	it("orders tiers cheapest first", async () => {
		const event = (await visitor().events.list()).find((e) => e.slug === slug);

		expect(event?.tickets.map((t) => t.price)).toEqual([499, 900]);
	});
});
