/**
 * Endpoint rate-limit integration tests: each limited procedure blocks once
 * its limit is reached, keyed on the right identity. They run against a real
 * Postgres database, so they are skipped unless RUN_DB_TESTS=1 and
 * DATABASE_URL points at a disposable database that already has the schema
 * applied. Every row the tests create is removed afterwards.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS } from "../lib/rate-limit";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

vi.mock("../services/email.service", () => ({
	sendTicketEmail: async () => null,
	sendInviteEmail: async () => null,
	sendTransferEmail: async () => null,
}));

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Settles a call and reports whether it was rate limited. */
async function limited(call: Promise<unknown>): Promise<boolean> {
	try {
		await call;
		return false;
	} catch (error) {
		return (error as { code?: string }).code === "TOO_MANY_REQUESTS";
	}
}

describeWithDb("endpoint rate limits (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	let ownerId: string;
	let organizerId: string;
	let eventId: string;
	let tierId: string;
	const slug = `limits-${suffix}`;

	const caller = (userId: string | null, ip: string) =>
		appRouter.createCaller(createContext(userId, null, null, ip));
	const book = (ip: string, email: string) =>
		caller(null, ip).events.ticketBook({
			slug,
			tierId,
			attendeeName: "Limit Tester",
			attendeeEmail: email,
		});

	beforeAll(async () => {
		const owner = await prisma.user.create({
			data: {
				email: `limits-owner-${suffix}@example.com`,
				passwordHash: await bcrypt.hash("correct horse battery", 4),
			},
			select: { id: true },
		});
		ownerId = owner.id;
		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Limits ${suffix}`,
				slug: `limits-org-${suffix}`,
				ownerId,
			},
			select: { id: true },
		});
		organizerId = org.id;
		const event = await prisma.event.create({
			data: {
				title: "Limits event",
				slug,
				status: "published",
				eventStart: new Date(Date.now() + 7 * 864e5),
				eventEnd: new Date(Date.now() + 8 * 864e5),
				organizerId,
				tickets: { create: { name: "Open", quantity: null } },
			},
			select: { id: true, tickets: { select: { id: true } } },
		});
		eventId = event.id;
		tierId = event.tickets[0].id;
	});

	afterAll(async () => {
		await prisma.ticketTransfer.deleteMany({
			where: { issuedTicket: { eventId } },
		});
		await prisma.eventVolunteer.deleteMany({ where: { eventId } });
		await prisma.issuedTicket.deleteMany({ where: { eventId } });
		await prisma.ticket.deleteMany({ where: { eventId } });
		await prisma.event.deleteMany({ where: { id: eventId } });
		await prisma.organizer.deleteMany({ where: { id: organizerId } });
		await prisma.user.deleteMany({ where: { id: ownerId } });
		await prisma.$disconnect();
	});

	it("ticketBook: limits bookings to one address, whichever IP they come from", async () => {
		const email = `target-${suffix}@example.com`;
		const outcomes: boolean[] = [];
		for (let i = 0; i <= RATE_LIMITS.bookEmail.limit; i++) {
			outcomes.push(await limited(book(randomUUID(), email)));
		}
		expect(outcomes.slice(0, -1).every((x) => !x)).toBe(true);
		expect(outcomes.at(-1)).toBe(true);
	});

	it("ticketBook: limits bookings from one IP", async () => {
		const ip = randomUUID();
		for (let i = 0; i < RATE_LIMITS.bookIp.limit; i++) {
			expect(await limited(book(ip, `ip-${i}-${suffix}@example.com`))).toBe(
				false,
			);
		}
		expect(await limited(book(ip, `ip-last-${suffix}@example.com`))).toBe(true);
		// Another IP is unaffected.
		expect(
			await limited(book(randomUUID(), `other-${suffix}@example.com`)),
		).toBe(false);
	});

	it("ticketGet: limits code lookups per IP, not link-token lookups", async () => {
		const ip = randomUUID();
		for (let i = 0; i < RATE_LIMITS.ticketLookupIp.limit; i++) {
			expect(
				await limited(
					caller(null, ip).events.ticketGet({ ticketCode: "OPT-ZZZZ-ZZZZ" }),
				),
			).toBe(false);
		}
		expect(
			await limited(
				caller(null, ip).events.ticketGet({ ticketCode: "OPT-ZZZZ-ZZZZ" }),
			),
		).toBe(true);
		expect(
			await limited(
				caller(null, ip).events.ticketGet({ accessToken: "x".repeat(43) }),
			),
		).toBe(false);
	});

	it("ticketResendLink: limits requests per IP", async () => {
		const ip = randomUUID();
		for (let i = 0; i < RATE_LIMITS.resendLinkIp.limit; i++) {
			expect(
				await limited(
					caller(null, ip).events.ticketResendLink({
						ticketCode: "OPT-ZZZZ-ZZZZ",
					}),
				),
			).toBe(false);
		}
		expect(
			await limited(
				caller(null, ip).events.ticketResendLink({
					ticketCode: "OPT-ZZZZ-ZZZZ",
				}),
			),
		).toBe(true);
	});

	it("ticketTransferInitiate: limits transfers started from one IP", async () => {
		const tickets: Awaited<ReturnType<typeof book>>[] = [];
		for (let i = 0; i <= RATE_LIMITS.transferIp.limit; i++) {
			tickets.push(await book(randomUUID(), `xfer-${i}-${suffix}@example.com`));
		}
		const ip = randomUUID();
		const transfer = (t: (typeof tickets)[number], i: number) =>
			caller(null, ip).events.ticketTransferInitiate({
				ticketCode: t.ticketCode,
				accessToken: t.accessToken,
				recipientName: "Recipient",
				recipientEmail: `xfer-to-${i}-${suffix}@example.com`,
			});
		for (let i = 0; i < RATE_LIMITS.transferIp.limit; i++) {
			expect(await limited(transfer(tickets[i], i))).toBe(false);
		}
		expect(
			await limited(transfer(tickets[RATE_LIMITS.transferIp.limit], 999)),
		).toBe(true);
	});

	it("changePassword: stops guessing the current password, even with the right one", async () => {
		const ip = randomUUID();
		for (let i = 0; i < RATE_LIMITS.changePasswordUser.limit; i++) {
			await expect(
				caller(ownerId, ip).users.changePassword({
					currentPassword: `wrong-${i}`,
					newPassword: "new password 123",
				}),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		}
		await expect(
			caller(ownerId, randomUUID()).users.changePassword({
				currentPassword: "correct horse battery",
				newPassword: "new password 123",
			}),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
	});

	it("invitations: limits invites sent by one user", async () => {
		for (let i = 0; i < RATE_LIMITS.inviteUser.limit; i++) {
			expect(
				await limited(
					caller(ownerId, randomUUID()).events.volunteersAdd({
						slug,
						name: "Invitee",
						email: `invite-${i}-${suffix}@example.com`,
						role: "Volunteer",
					}),
				),
			).toBe(false);
		}
		expect(
			await limited(
				caller(ownerId, randomUUID()).events.volunteersAdd({
					slug,
					name: "Invitee",
					email: `invite-last-${suffix}@example.com`,
					role: "Volunteer",
				}),
			),
		).toBe(true);
	});
});
