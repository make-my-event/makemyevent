/**
 * Banner storage integration tests: banner URLs must point inside the event's
 * own storage folder, and deleting a banner can only remove that event's
 * files. Storage is replaced by a fake that records what would be removed.
 * They run against a real Postgres database, so they are skipped unless
 * RUN_DB_TESTS=1 and DATABASE_URL points at a disposable database that
 * already has the schema applied. Every row the tests create is removed
 * afterwards.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "db";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

const SUPABASE = "https://example.supabase.co";
const { removed } = vi.hoisted(() => ({ removed: [] as string[][] }));
vi.mock("../lib/supabase", () => ({
	supabaseAdmin: {
		storage: {
			from: () => ({
				createSignedUploadUrl: async (path: string) => ({
					data: { signedUrl: `${SUPABASE}/upload/${path}`, token: "t" },
					error: null,
				}),
				getPublicUrl: (path: string) => ({
					data: {
						publicUrl: `${SUPABASE}/storage/v1/object/public/event-banners/${path}`,
					},
				}),
				remove: async (keys: string[]) => {
					removed.push(keys);
					return { data: null, error: null };
				},
			}),
		},
	},
}));

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeWithDb("event banners (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const original = process.env.SUPABASE_URL;
	let ownerId: string;
	let organizerId: string;
	let eventId: string;
	let otherEventId: string;

	const owner = () =>
		appRouter.createCaller(createContext(ownerId, null, null, randomUUID()));
	const bannerUrl = (id: string, file = "1700000000000.jpg") =>
		`${SUPABASE}/storage/v1/object/public/event-banners/${id}/${file}`;
	const base = (id: string) => ({
		id,
		title: "Banner event",
		format: "meetup" as const,
		topic: "technology" as const,
		isOnline: false,
		timezone: "UTC",
		eventStart: new Date(Date.now() + 7 * 864e5).toISOString(),
		eventEnd: new Date(Date.now() + 8 * 864e5).toISOString(),
		registrationStart: null,
		registrationEnd: null,
	});
	const storedBanner = async (id: string) =>
		(
			await prisma.event.findUniqueOrThrow({
				where: { id },
				select: { bannerUrl: true },
			})
		).bannerUrl;

	beforeAll(async () => {
		process.env.SUPABASE_URL = SUPABASE;
		const user = await prisma.user.create({
			data: { email: `banner-${suffix}@example.com` },
			select: { id: true },
		});
		ownerId = user.id;
		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Banner ${suffix}`,
				slug: `banner-org-${suffix}`,
				ownerId,
			},
			select: { id: true },
		});
		organizerId = org.id;
		const make = (slug: string) =>
			prisma.event.create({
				data: {
					title: "Banner event",
					slug,
					eventStart: new Date(Date.now() + 7 * 864e5),
					eventEnd: new Date(Date.now() + 8 * 864e5),
					organizerId,
				},
				select: { id: true },
			});
		eventId = (await make(`banner-a-${suffix}`)).id;
		otherEventId = (await make(`banner-b-${suffix}`)).id;
	});

	afterAll(async () => {
		if (original === undefined) delete process.env.SUPABASE_URL;
		else process.env.SUPABASE_URL = original;
		await prisma.event.deleteMany({ where: { organizerId } });
		await prisma.organizer.deleteMany({ where: { id: organizerId } });
		await prisma.user.deleteMany({ where: { id: ownerId } });
		await prisma.$disconnect();
	});

	beforeEach(() => {
		removed.length = 0;
	});

	it("bannerConfirm accepts only a file in the event's own folder", async () => {
		await expect(
			owner().events.bannerConfirm({
				eventId,
				publicUrl: bannerUrl(otherEventId),
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			owner().events.bannerConfirm({
				eventId,
				publicUrl: "https://tracker.example/pixel.png",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		await owner().events.bannerConfirm({
			eventId,
			publicUrl: bannerUrl(eventId),
		});
		expect(await storedBanner(eventId)).toBe(bannerUrl(eventId));
	});

	it("events.update cannot point the banner elsewhere, but can keep or clear it", async () => {
		await expect(
			owner().events.update({
				...base(eventId),
				bannerUrl: bannerUrl(otherEventId),
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		// Unchanged value is fine.
		await owner().events.update({
			...base(eventId),
			bannerUrl: bannerUrl(eventId),
		});
		// Clearing is fine.
		await owner().events.update({ ...base(otherEventId), bannerUrl: null });
		expect(await storedBanner(otherEventId)).toBeNull();
	});

	it("bannerDelete never removes another event's file", async () => {
		// Simulate older data: a banner URL pointing at another event's folder.
		await prisma.event.update({
			where: { id: otherEventId },
			data: { bannerUrl: bannerUrl(eventId, "victim.jpg") },
		});
		await owner().events.bannerDelete({ eventId: otherEventId });
		expect(removed).toEqual([]);
		expect(await storedBanner(otherEventId)).toBeNull();
	});

	it("bannerDelete removes the event's own file", async () => {
		await owner().events.bannerDelete({ eventId });
		expect(removed).toEqual([[`${eventId}/1700000000000.jpg`]]);
		expect(await storedBanner(eventId)).toBeNull();
	});
});
