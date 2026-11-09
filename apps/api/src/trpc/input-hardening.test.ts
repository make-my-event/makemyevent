/**
 * Integration tests: rich text is sanitized and URLs are validated where the
 * API stores them. They run against a real Postgres database, so they are
 * skipped unless RUN_DB_TESTS=1 and DATABASE_URL points at a disposable
 * database that already has the schema applied. Every row the tests create is
 * removed afterwards.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const XSS =
	'<p>Safe</p><img src=x onerror="alert(1)"><script>alert(2)</script>';
const SCRIPT_URL = "javascript:alert(document.domain)";

describeWithDb("input hardening (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	let ownerId: string;
	let organizerId: string;
	let eventId: string;
	const slug = `hardening-${suffix}`;

	const owner = () => appRouter.createCaller(createContext(ownerId, null));

	const expectSafeHtml = (value: string | null | undefined) => {
		expect(value).toBe("<p>Safe</p>");
	};

	beforeAll(async () => {
		const user = await prisma.user.create({
			data: { email: `hardening-${suffix}@example.com`, name: "Owner" },
			select: { id: true },
		});
		ownerId = user.id;
		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Hardening ${suffix}`,
				slug: `hardening-org-${suffix}`,
				ownerId,
			},
			select: { id: true },
		});
		organizerId = org.id;
		const event = await prisma.event.create({
			data: {
				title: "Hardening event",
				slug,
				status: "draft",
				eventStart: new Date(Date.now() + 7 * 24 * 3600 * 1000),
				eventEnd: new Date(Date.now() + 8 * 24 * 3600 * 1000),
				organizerId,
			},
			select: { id: true },
		});
		eventId = event.id;
	});

	afterAll(async () => {
		await prisma.scheduleItem.deleteMany({ where: { eventId } });
		await prisma.eventPartner.deleteMany({ where: { eventId } });
		await prisma.customQuestion.deleteMany({
			where: { rsvpForm: { eventId } },
		});
		await prisma.rsvpForm.deleteMany({ where: { eventId } });
		await prisma.cfpCustomQuestion.deleteMany({
			where: { cfpForm: { eventId } },
		});
		await prisma.cfpForm.deleteMany({ where: { eventId } });
		await prisma.event.deleteMany({ where: { id: eventId } });
		await prisma.organizer.deleteMany({ where: { id: organizerId } });
		await prisma.user.deleteMany({ where: { id: ownerId } });
		await prisma.$disconnect();
	});

	describe("rich text is sanitized on save", () => {
		it("organization description", async () => {
			await owner().organizers.updateOrganization({
				organizerId,
				description: XSS,
			});
			const row = await prisma.organizer.findUniqueOrThrow({
				where: { id: organizerId },
				select: { description: true },
			});
			expectSafeHtml(row.description);
		});

		it("RSVP form description", async () => {
			await owner().events.rsvpUpdateForm({
				slug,
				isPublished: false,
				allowEdit: true,
				requiresApproval: false,
				maxRsvpCount: 10,
				description: XSS,
				customQuestions: [],
			});
			const row = await prisma.rsvpForm.findUniqueOrThrow({
				where: { eventId },
				select: { description: true },
			});
			expectSafeHtml(row.description);
		});

		it("CFP guidelines", async () => {
			await owner().events.cfpUpdateForm({
				slug,
				isPublished: false,
				allowEdit: true,
				anonymiseProposals: false,
				hideReviews: false,
				onlyWorkshops: false,
				onlyTalks: false,
				publicCustomResponses: false,
				guidelines: XSS,
				customQuestions: [],
			});
			const row = await prisma.cfpForm.findUniqueOrThrow({
				where: { eventId },
				select: { guidelines: true },
			});
			expectSafeHtml(row.guidelines);
		});

		it("schedule item description", async () => {
			await owner().events.scheduleSave({
				slug,
				showSchedule: true,
				items: [
					{
						title: "Talk",
						description: XSS,
						scheduledDate: "2026-12-01",
						startTime: "10:00",
						endTime: "10:30",
					},
				],
			});
			const row = await prisma.scheduleItem.findFirstOrThrow({
				where: { eventId },
				select: { description: true },
			});
			expectSafeHtml(row.description);
		});
	});

	describe("script and data URLs are rejected", () => {
		it("organization website and logo", async () => {
			await expect(
				owner().organizers.updateOrganization({
					organizerId,
					website: SCRIPT_URL,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				owner().organizers.updateOrganization({
					organizerId,
					logoUrl: "data:image/svg+xml,<svg onload=alert(1)>",
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("event online, recording and map links", async () => {
			const base = {
				id: eventId,
				title: "Hardening event",
				format: "meetup" as const,
				topic: "technology" as const,
				isOnline: true,
				timezone: "UTC",
				eventStart: new Date(Date.now() + 7 * 864e5).toISOString(),
				eventEnd: new Date(Date.now() + 8 * 864e5).toISOString(),
				registrationStart: null,
				registrationEnd: null,
			};
			for (const field of ["onlineLink", "recordingLink", "mapLink"]) {
				await expect(
					owner().events.update({ ...base, [field]: SCRIPT_URL }),
				).rejects.toMatchObject({ code: "BAD_REQUEST" });
			}
		});

		it("partner website and logo", async () => {
			await expect(
				owner().events.partnersSave({
					slug,
					showPartners: true,
					partners: [{ type: "sponsor", name: "Acme", websiteUrl: SCRIPT_URL }],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				owner().events.partnersSave({
					slug,
					showPartners: true,
					partners: [
						{
							type: "sponsor",
							name: "Acme",
							logoUrl: "http://insecure.example/x.png",
						},
					],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(await prisma.eventPartner.count({ where: { eventId } })).toBe(0);
		});

		it("profile image", async () => {
			await expect(
				owner().users.updateBasicInfo({ name: "Owner", image: SCRIPT_URL }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("still accepts normal links, normalising bare domains", async () => {
			await owner().organizers.updateOrganization({
				organizerId,
				website: "example.com/about",
			});
			const row = await prisma.organizer.findUniqueOrThrow({
				where: { id: organizerId },
				select: { website: true },
			});
			expect(row.website).toBe("https://example.com/about");
		});
	});
});
