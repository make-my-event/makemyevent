/**
 * Data-exposure integration tests: what public and lower-privilege callers can
 * read from events, organizers and communities procedures. They run against a
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

/** Every value stored under `key`, at any depth of a response. */
function valuesAtKey(value: unknown, key: string): unknown[] {
	const found: unknown[] = [];
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
		} else if (node !== null && typeof node === "object") {
			for (const [k, v] of Object.entries(node)) {
				if (k === key) found.push(v);
				visit(v);
			}
		}
	};
	visit(value);
	return found;
}

/** Non-empty email strings anywhere in a response. */
const leakedEmails = (value: unknown): unknown[] =>
	valuesAtKey(value, "email").filter((v) => typeof v === "string" && v !== "");

describeWithDb("data exposure (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const email = (label: string) => `${label}-${suffix}@example.com`;
	const userIds: string[] = [];

	let ownerId: string;
	let strangerId: string;
	let speakerId: string;
	let organizerId: string;
	let communityId: string;
	let publishedEventId: string;
	let draftEventId: string;
	let unpublishedTierName: string;

	const publishedSlug = `exposure-pub-${suffix}`;
	const draftSlug = `exposure-draft-${suffix}`;
	const orgSlug = `exposure-org-${suffix}`;
	const communitySlug = `exposure-community-${suffix}`;

	const anonymous = () =>
		appRouter.createCaller(createContext(null, null, null, randomUUID()));
	const as = (userId: string) =>
		appRouter.createCaller(createContext(userId, null, null, randomUUID()));

	const createUser = async (label: string, name: string | null) => {
		const user = await prisma.user.create({
			data: { email: email(label), name },
			select: { id: true },
		});
		userIds.push(user.id);
		return user.id;
	};

	beforeAll(async () => {
		ownerId = await createUser("owner", "Owner");
		strangerId = await createUser("stranger", "Stranger");
		speakerId = await createUser("speaker", "Speaker");

		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Exposure Org ${suffix}`,
				slug: orgSlug,
				ownerId,
				// A member with no name and no linked account: the public view
				// must not fall back to their email address.
				members: {
					create: { email: email("unnamed-member"), role: "ADMIN" },
				},
			},
			select: { id: true },
		});
		organizerId = org.id;

		const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
		const end = new Date(start.getTime() + 3 * 3600 * 1000);
		unpublishedTierName = `Hidden tier ${suffix}`;

		const published = await prisma.event.create({
			data: {
				title: "Published event",
				slug: publishedSlug,
				status: "published",
				eventStart: start,
				eventEnd: end,
				organizerId,
				tickets: {
					create: [
						{ name: "General", isPublished: true },
						{ name: unpublishedTierName, isPublished: false },
					],
				},
				cfpForm: { create: { isPublished: false } },
			},
			select: { id: true, cfpForm: { select: { id: true } } },
		});
		publishedEventId = published.id;

		const submission = await prisma.cfpSubmission.create({
			data: {
				eventId: publishedEventId,
				cfpFormId: published.cfpForm?.id ?? "",
				speakerId,
				title: "Accepted talk",
				abstract: "Private abstract",
				status: "Accepted",
			},
			select: { id: true },
		});
		await prisma.scheduleItem.create({
			data: {
				eventId: publishedEventId,
				title: "Accepted talk",
				scheduledDate: "2026-12-01",
				startTime: "10:00",
				endTime: "10:30",
				linkedCfpSubmissionId: submission.id,
			},
		});

		const tier = await prisma.ticket.findFirstOrThrow({
			where: { eventId: publishedEventId, isPublished: true },
			select: { id: true },
		});
		await prisma.issuedTicket.create({
			data: {
				ticketId: tier.id,
				eventId: publishedEventId,
				ticketCode: `T-${randomUUID()}`,
				qrToken: `qr-${randomUUID()}`,
				attendeeName: "Guest",
				attendeeEmail: email("guest"),
			},
		});

		const draft = await prisma.event.create({
			data: {
				title: "Draft event",
				slug: draftSlug,
				status: "draft",
				eventStart: start,
				eventEnd: end,
				organizerId,
			},
			select: { id: true },
		});
		draftEventId = draft.id;

		const community = await prisma.community.create({
			data: {
				organizerId,
				name: "Exposure community",
				slug: communitySlug,
				members: { create: { email: email("community-lead"), role: "ADMIN" } },
			},
			select: { id: true },
		});
		communityId = community.id;
	});

	afterAll(async () => {
		const inEvents = { eventId: { in: [publishedEventId, draftEventId] } };
		await prisma.scheduleItem.deleteMany({ where: inEvents });
		await prisma.cfpSubmission.deleteMany({ where: inEvents });
		await prisma.cfpForm.deleteMany({ where: inEvents });
		await prisma.issuedTicket.deleteMany({ where: inEvents });
		await prisma.ticket.deleteMany({ where: inEvents });
		await prisma.event.deleteMany({
			where: { id: { in: [publishedEventId, draftEventId] } },
		});
		await prisma.communityMember.deleteMany({ where: { communityId } });
		await prisma.community.deleteMany({ where: { id: communityId } });
		await prisma.organizerMember.deleteMany({ where: { organizerId } });
		await prisma.organizer.deleteMany({ where: { id: organizerId } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await prisma.$disconnect();
	});

	describe("events.ticketsGet", () => {
		it("returns no emails, no per-ticket rows and no unpublished tiers to the public", async () => {
			const result = await anonymous().events.ticketsGet({
				slug: publishedSlug,
			});

			expect(leakedEmails(result)).toEqual([]);
			expect(valuesAtKey(result, "issuedTickets")).toEqual([]);
			expect(result.tiers.map((t) => t.name)).not.toContain(
				unpublishedTierName,
			);
			// The unnamed member is shown with a neutral label, not their email.
			expect(JSON.stringify(result)).not.toContain("unnamed-member");
		});

		it("hides draft events from the public and from signed-in outsiders", async () => {
			await expect(
				anonymous().events.ticketsGet({ slug: draftSlug }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			await expect(
				as(strangerId).events.ticketsGet({ slug: draftSlug }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("still shows drafts and unpublished tiers to the organizer", async () => {
			const draft = await as(ownerId).events.ticketsGet({ slug: draftSlug });
			expect(draft.event.status).toBe("draft");

			const published = await as(ownerId).events.ticketsGet({
				slug: publishedSlug,
			});
			expect(published.tiers.map((t) => t.name)).toContain(unpublishedTierName);
		});
	});

	describe("events.scheduleGet", () => {
		it("returns no speaker emails and no proposals to the public", async () => {
			const result = await anonymous().events.scheduleGet({
				slug: publishedSlug,
			});
			expect(result.items).toHaveLength(1);
			expect(leakedEmails(result)).toEqual([]);
			expect(result.acceptedProposals).toEqual([]);
		});

		it("gives the organizer the proposals the schedule editor needs", async () => {
			const result = await as(ownerId).events.scheduleGet({
				slug: publishedSlug,
			});
			expect(result.acceptedProposals).toHaveLength(1);
			expect(result.acceptedProposals[0].speaker.email).toBe(email("speaker"));
		});

		it("hides draft events from the public", async () => {
			await expect(
				anonymous().events.scheduleGet({ slug: draftSlug }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});
	});

	describe("events.partnersGet and events.cfpGetForm", () => {
		it("hide draft events from the public", async () => {
			await expect(
				anonymous().events.partnersGet({ slug: draftSlug }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			await expect(
				anonymous().events.cfpGetForm({ slug: draftSlug }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("returns an unpublished CFP form only to the organizer", async () => {
			await expect(
				anonymous().events.cfpGetForm({ slug: publishedSlug }),
			).resolves.toBeNull();
			const form = await as(ownerId).events.cfpGetForm({
				slug: publishedSlug,
			});
			expect(form).not.toBeNull();
		});
	});

	describe("events.manageGuestsList", () => {
		it("never returns check-in QR tokens", async () => {
			const result = await as(ownerId).events.manageGuestsList({
				slug: publishedSlug,
			});
			expect(result.issuedTickets).toHaveLength(1);
			expect(valuesAtKey(result, "qrToken")).toEqual([]);
		});
	});

	describe("organizers.getOverview", () => {
		it("returns no member emails and no draft events to the public", async () => {
			const result = await anonymous().organizers.getOverview({
				slug: orgSlug,
			});
			expect(leakedEmails(result)).toEqual([]);
			expect(result.events.map((e) => e.slug)).not.toContain(draftSlug);
			expect(result._count.events).toBe(1);
			expect(result.members[0].name).toBe("Team member");
		});

		it("still gives the owner member emails and drafts", async () => {
			const result = await as(ownerId).organizers.getOverview({
				slug: orgSlug,
			});
			expect(leakedEmails(result)).toContain(email("unnamed-member"));
			expect(result.events.map((e) => e.slug)).toContain(draftSlug);
		});
	});

	describe("communities.getBySlug", () => {
		it("returns no member emails to the public", async () => {
			const result = await anonymous().communities.getBySlug({
				slug: communitySlug,
			});
			expect(leakedEmails(result)).toEqual([]);
		});

		it("still gives member emails to someone who manages the community", async () => {
			const result = await as(ownerId).communities.getBySlug({
				slug: communitySlug,
			});
			expect(leakedEmails(result)).toContain(email("community-lead"));
		});
	});
});
