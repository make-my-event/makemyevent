/**
 * Authorization integration tests for events router procedures that act on
 * event-scoped resources. They run against a real Postgres database, so they
 * are skipped unless RUN_DB_TESTS=1 and DATABASE_URL points at a disposable
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

describeWithDb("events authorization (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const userIds: string[] = [];
	const organizerIds: string[] = [];
	const eventIds: string[] = [];
	const communityIds: string[] = [];

	// "victim" owns organizer A and its event; "attacker" owns organizer B,
	// its event and a sub-community under B; "stranger" has no role anywhere.
	let victimId: string;
	let attackerId: string;
	let strangerId: string;
	let orgAId: string;
	let orgBId: string;
	let communityBId: string;
	let eventASlug: string;
	let eventBSlug: string;
	let eventAId: string;
	let eventBId: string;
	let tierAId: string;

	const as = (userId: string) =>
		appRouter.createCaller(createContext(userId, null, null, randomUUID()));

	const future = (days: number) =>
		new Date(Date.now() + days * 24 * 3600 * 1000);

	const createUser = async (label: string) => {
		const user = await prisma.user.create({
			data: { email: `${label}-${suffix}@example.com`, name: label },
			select: { id: true },
		});
		userIds.push(user.id);
		return user.id;
	};

	const createEvent = async (organizerId: string, slug: string) => {
		const event = await prisma.event.create({
			data: {
				title: `Event ${slug}`,
				slug,
				status: "published",
				eventStart: future(7),
				eventEnd: future(8),
				organizerId,
			},
			select: { id: true },
		});
		eventIds.push(event.id);
		return event.id;
	};

	const issueTicket = (status: "CONFIRMED" | "WAITLISTED" | "DROPPED") =>
		prisma.issuedTicket.create({
			data: {
				ticketId: tierAId,
				eventId: eventAId,
				ticketCode: `T-${randomUUID()}`,
				qrToken: `qr-${randomUUID()}`,
				attendeeName: "Guest",
				attendeeEmail: `guest-${randomUUID()}@example.com`,
				status,
			},
			select: { id: true },
		});

	const ticketStatus = async (id: string) =>
		(
			await prisma.issuedTicket.findUniqueOrThrow({
				where: { id },
				select: { status: true },
			})
		).status;

	beforeAll(async () => {
		victimId = await createUser("victim");
		attackerId = await createUser("attacker");
		strangerId = await createUser("stranger");

		const orgA = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Org A ${suffix}`,
				slug: `org-a-${suffix}`,
				ownerId: victimId,
			},
			select: { id: true },
		});
		const orgB = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Org B ${suffix}`,
				slug: `org-b-${suffix}`,
				ownerId: attackerId,
			},
			select: { id: true },
		});
		orgAId = orgA.id;
		orgBId = orgB.id;
		organizerIds.push(orgAId, orgBId);

		const communityB = await prisma.community.create({
			data: {
				organizerId: orgBId,
				name: "Community B",
				slug: `community-b-${suffix}`,
				members: {
					create: {
						userId: attackerId,
						email: `attacker-${suffix}@example.com`,
						role: "OWNER",
					},
				},
			},
			select: { id: true },
		});
		communityBId = communityB.id;
		communityIds.push(communityBId);

		eventASlug = `authz-a-${suffix}`;
		eventBSlug = `authz-b-${suffix}`;
		eventAId = await createEvent(orgAId, eventASlug);
		eventBId = await createEvent(orgBId, eventBSlug);

		const tierA = await prisma.ticket.create({
			data: { eventId: eventAId, name: "General Pass", quantity: 100 },
			select: { id: true },
		});
		tierAId = tierA.id;
	});

	afterAll(async () => {
		const inEvents = { eventId: { in: eventIds } };
		await prisma.rsvpCheckIn.deleteMany({
			where: { submission: inEvents },
		});
		await prisma.rsvpSubmission.deleteMany({ where: inEvents });
		await prisma.scheduleItem.deleteMany({ where: inEvents });
		await prisma.cfpSubmission.deleteMany({ where: inEvents });
		await prisma.cfpForm.deleteMany({ where: inEvents });
		await prisma.eventVolunteer.deleteMany({ where: inEvents });
		await prisma.issuedTicket.deleteMany({ where: inEvents });
		await prisma.ticket.deleteMany({ where: inEvents });
		await prisma.event.deleteMany({
			where: {
				OR: [{ id: { in: eventIds } }, { organizerId: { in: organizerIds } }],
			},
		});
		await prisma.communityMember.deleteMany({
			where: { communityId: { in: communityIds } },
		});
		await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
		await prisma.organizer.deleteMany({ where: { id: { in: organizerIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await prisma.$disconnect();
	});

	describe("volunteersGet", () => {
		it("rejects a signed-in user with no role on the event and writes nothing", async () => {
			await expect(
				as(strangerId).events.volunteersGet({ slug: eventASlug }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			const seeded = await prisma.eventVolunteer.count({
				where: { eventId: eventAId },
			});
			expect(seeded).toBe(0);
		});

		it("still works for the organizer owner", async () => {
			const result = await as(victimId).events.volunteersGet({
				slug: eventASlug,
			});
			expect(result.isOwner).toBe(true);
		});
	});

	describe("create", () => {
		const baseInput = {
			title: "Injected event",
			eventStart: future(10).toISOString(),
			eventEnd: future(11).toISOString(),
		};

		it("rejects creating an event under another organizer via an unrelated community", async () => {
			await expect(
				as(attackerId).events.create({
					...baseInput,
					organizerId: orgAId,
					communityId: communityBId,
					slug: `injected-${suffix}`,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			const created = await prisma.event.count({
				where: { organizerId: orgAId, title: baseInput.title },
			});
			expect(created).toBe(0);
		});

		it("rejects an organizer owner attaching an event to another organizer's community", async () => {
			await expect(
				as(victimId).events.create({
					...baseInput,
					organizerId: orgAId,
					communityId: communityBId,
					slug: `foreign-community-${suffix}`,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("still lets a community lead create an event for the community's own organizer", async () => {
			const event = await as(attackerId).events.create({
				...baseInput,
				organizerId: orgBId,
				communityId: communityBId,
				slug: `own-community-${suffix}`,
			});
			eventIds.push(event.id);
			expect(event.slug).toContain("own-community");
		});
	});

	describe("rsvpToggleCheckIn", () => {
		it("rejects a submission that belongs to a different event", async () => {
			const submission = await prisma.rsvpSubmission.create({
				data: { eventId: eventAId, userId: strangerId },
				select: { id: true },
			});

			for (const action of ["checkin", "undo"] as const) {
				await expect(
					as(attackerId).events.rsvpToggleCheckIn({
						slug: eventBSlug,
						submissionId: submission.id,
						action,
					}),
				).rejects.toMatchObject({ code: "NOT_FOUND" });
			}

			const checkIns = await prisma.rsvpCheckIn.count({
				where: { submissionId: submission.id },
			});
			expect(checkIns).toBe(0);
		});
	});

	describe("rsvpGetStats", () => {
		it("rejects a user with no role on the event", async () => {
			await expect(
				as(strangerId).events.rsvpGetStats({ slug: eventASlug }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("returns stats to the organizer owner", async () => {
			const stats = await as(victimId).events.rsvpGetStats({
				slug: eventASlug,
			});
			expect(stats).toHaveProperty("totalAccepted");
		});
	});

	describe("scheduleSave", () => {
		it("rejects linking a proposal from another event and keeps the existing schedule", async () => {
			const cfpForm = await prisma.cfpForm.create({
				data: { eventId: eventAId },
				select: { id: true },
			});
			const foreignProposal = await prisma.cfpSubmission.create({
				data: {
					eventId: eventAId,
					cfpFormId: cfpForm.id,
					speakerId: victimId,
					title: "Private talk",
					abstract: "Not for other events",
					status: "Accepted",
				},
				select: { id: true },
			});
			await prisma.scheduleItem.create({
				data: {
					eventId: eventBId,
					title: "Existing slot",
					scheduledDate: "2026-12-01",
					startTime: "10:00",
					endTime: "10:30",
				},
			});

			await expect(
				as(attackerId).events.scheduleSave({
					slug: eventBSlug,
					showSchedule: true,
					items: [
						{
							title: "Stolen",
							scheduledDate: "2026-12-01",
							startTime: "11:00",
							endTime: "11:30",
							linkedCfpSubmissionId: foreignProposal.id,
						},
					],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			const items = await prisma.scheduleItem.findMany({
				where: { eventId: eventBId },
				select: { title: true },
			});
			expect(items.map((i) => i.title)).toEqual(["Existing slot"]);
		});
	});

	describe("manageGuestToggleCheckIn", () => {
		const toggle = (id: string, action: "checkin" | "undo") =>
			as(victimId).events.manageGuestToggleCheckIn({
				slug: eventASlug,
				guestType: "ticket",
				id,
				action,
			});

		it("refuses to check in a waitlisted ticket", async () => {
			const ticket = await issueTicket("WAITLISTED");
			await expect(toggle(ticket.id, "checkin")).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
			expect(await ticketStatus(ticket.id)).toBe("WAITLISTED");
		});

		it("refuses to turn a dropped ticket into a confirmed one via undo", async () => {
			const ticket = await issueTicket("DROPPED");
			await expect(toggle(ticket.id, "undo")).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
			expect(await ticketStatus(ticket.id)).toBe("DROPPED");
		});

		it("checks in a confirmed ticket and undoes it back to confirmed", async () => {
			const ticket = await issueTicket("CONFIRMED");

			const readTicket = () =>
				prisma.issuedTicket.findUniqueOrThrow({
					where: { id: ticket.id },
					select: { status: true, checkedInAt: true },
				});

			await toggle(ticket.id, "checkin");
			const checkedIn = await readTicket();
			expect(checkedIn.status).toBe("CHECKED_IN");
			expect(checkedIn.checkedInAt).not.toBeNull();

			await toggle(ticket.id, "undo");
			const undone = await readTicket();
			expect(undone.status).toBe("CONFIRMED");
			expect(undone.checkedInAt).toBeNull();
		});
	});
});
