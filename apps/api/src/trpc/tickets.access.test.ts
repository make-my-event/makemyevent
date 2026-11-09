/**
 * Ticket access integration tests: who can see and act on a ticket, the
 * ticket link token, transfers, link resend, guest check-in binding and the
 * booking rules. They run against a real Postgres database, so they are
 * skipped unless RUN_DB_TESTS=1 and DATABASE_URL points at a disposable
 * database that already has the schema applied. Every row the tests create is
 * removed afterwards.
 */
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
	TicketEmailParams,
	TransferEmailParams,
} from "../services/email.service";
import { bindGuestCheckinToken } from "../services/tickets";
import { appRouter } from "./app.router";
import { createContext } from "./trpc";

// Capture emails instead of sending them: emails are where link tokens go.
const { ticketEmails, transferEmails } = vi.hoisted(() => ({
	ticketEmails: [] as TicketEmailParams[],
	transferEmails: [] as TransferEmailParams[],
}));
vi.mock("../services/email.service", () => ({
	sendTicketEmail: async (p: TicketEmailParams) => {
		ticketEmails.push(p);
		return null;
	},
	sendTransferEmail: async (p: TransferEmailParams) => {
		transferEmails.push(p);
		return null;
	},
	sendInviteEmail: async () => null,
}));

const describeWithDb =
	process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Every value stored under `key`, at any depth of a response. */
function valuesAtKey(value: unknown, key: string): unknown[] {
	const found: unknown[] = [];
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) for (const item of node) visit(item);
		else if (node !== null && typeof node === "object") {
			for (const [k, v] of Object.entries(node)) {
				if (k === key) found.push(v);
				visit(v);
			}
		}
	};
	visit(value);
	return found;
}

describeWithDb("ticket access (database)", () => {
	const suffix = randomUUID().slice(0, 8);
	const userIds: string[] = [];
	let ownerId: string;
	let organizerId: string;
	let eventId: string;
	let tierId: string;
	let hiddenTierId: string;
	let closedTierId: string;
	const slug = `tickets-${suffix}`;

	const anonymous = () =>
		appRouter.createCaller(createContext(null, null, null, randomUUID()));
	const as = (userId: string) =>
		appRouter.createCaller(createContext(userId, null, null, randomUUID()));

	const createUser = async (email: string, oauth = false) => {
		const user = await prisma.user.create({
			data: {
				email,
				...(oauth
					? {
							accounts: {
								create: {
									type: "oidc",
									provider: "google",
									providerAccountId: `g-${randomUUID()}`,
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

	const book = (email: string, tier = tierId, caller = anonymous()) =>
		caller.events.ticketBook({
			slug,
			tierId: tier,
			attendeeName: "Sam Guest",
			attendeeEmail: email,
			attendeePhone: "+10000000000",
			answers: '{"q":"private answer"}',
		});

	beforeAll(async () => {
		ownerId = await createUser(`owner-${suffix}@example.com`);
		const org = await prisma.organizer.create({
			data: {
				type: "community",
				name: `Tickets ${suffix}`,
				slug: `tickets-org-${suffix}`,
				ownerId,
			},
			select: { id: true },
		});
		organizerId = org.id;
		const event = await prisma.event.create({
			data: {
				title: "Ticket access event",
				slug,
				status: "published",
				eventStart: new Date(Date.now() + 7 * 864e5),
				eventEnd: new Date(Date.now() + 8 * 864e5),
				organizerId,
				tickets: {
					create: [
						{ name: "General", quantity: null, isPublished: true, order: 0 },
						{ name: "Hidden", isPublished: false, order: 1 },
						{
							name: "Closed",
							isPublished: true,
							salesEnd: new Date(Date.now() - 1000),
							order: 2,
						},
					],
				},
			},
			select: { id: true, tickets: { select: { id: true, name: true } } },
		});
		eventId = event.id;
		const byName = Object.fromEntries(event.tickets.map((t) => [t.name, t.id]));
		tierId = byName.General;
		hiddenTierId = byName.Hidden;
		closedTierId = byName.Closed;
	});

	afterAll(async () => {
		await prisma.guestTicketToken.deleteMany({
			where: { issuedTicket: { eventId } },
		});
		await prisma.ticketTransfer.deleteMany({
			where: { issuedTicket: { eventId } },
		});
		await prisma.issuedTicket.deleteMany({ where: { eventId } });
		await prisma.ticket.deleteMany({ where: { eventId } });
		await prisma.event.deleteMany({ where: { id: eventId } });
		await prisma.organizer.deleteMany({ where: { id: organizerId } });
		await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await prisma.$disconnect();
	});

	describe("booking", () => {
		it("returns a link token, stores only its hash, and emails the link", async () => {
			const email = `link-${suffix}@example.com`;
			const res = await book(email);
			expect(res.status).toBe("CONFIRMED");
			expect(res.ticketCode).toMatch(
				/^OPT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/,
			);

			const row = await prisma.issuedTicket.findUniqueOrThrow({
				where: { ticketCode: res.ticketCode },
				select: { accessTokenHash: true },
			});
			expect(row.accessTokenHash).toBe(sha256(res.accessToken));

			const mail = ticketEmails.find((m) => m.ticketCode === res.ticketCode);
			expect(mail?.accessToken).toBe(res.accessToken);
		});

		it("rejects hidden tiers and tiers whose sales have ended", async () => {
			await expect(
				book(`hidden-${suffix}@example.com`, hiddenTierId),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			await expect(
				book(`closed-${suffix}@example.com`, closedTierId),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("never oversells under concurrent bookings", async () => {
			const raceTier = await prisma.ticket.create({
				data: { eventId, name: `Race ${suffix}`, quantity: 3 },
				select: { id: true },
			});
			const results = await Promise.allSettled(
				Array.from({ length: 12 }, (_, i) =>
					book(`race-${i}-${suffix}@example.com`, raceTier.id),
				),
			);
			const confirmed = await prisma.issuedTicket.count({
				where: { ticketId: raceTier.id, status: "CONFIRMED" },
			});
			expect(confirmed).toBe(3);
			// Every request either got a ticket or was told to retry; none oversold.
			for (const r of results) {
				if (r.status === "rejected") {
					expect(r.reason).toMatchObject({ code: "CONFLICT" });
				}
			}
		});
	});

	describe("viewing a ticket", () => {
		let code: string;
		let token: string;
		beforeAll(async () => {
			const res = await book(`view-${suffix}@example.com`);
			code = res.ticketCode;
			token = res.accessToken;
		});

		it("a ticket code alone returns a minimal card with no credentials or contact details", async () => {
			const res = await anonymous().events.ticketGet({ ticketCode: code });
			expect(res.access).toBe("limited");
			for (const key of [
				"qrToken",
				"attendeeEmail",
				"attendeePhone",
				"answers",
				"pendingTransfer",
				"onlineLink",
			]) {
				expect(valuesAtKey(res, key)).toEqual([]);
			}
		});

		it("the link token returns the full pass", async () => {
			const res = await anonymous().events.ticketGet({ accessToken: token });
			expect(res.access).toBe("full");
			expect(valuesAtKey(res, "qrToken")).toHaveLength(1);
			expect(valuesAtKey(res, "accessTokenHash")).toEqual([]);
		});

		it("the signed-in owner and the organizer see the full pass by code", async () => {
			const email = `owned-${suffix}@example.com`;
			const userId = await createUser(email);
			const res = await book(email, tierId, as(userId));
			expect(
				(await as(userId).events.ticketGet({ ticketCode: res.ticketCode }))
					.access,
			).toBe("full");
			expect(
				(await as(ownerId).events.ticketGet({ ticketCode: res.ticketCode }))
					.access,
			).toBe("full");
		});

		it("an account with the attendee email sees the full pass only if that email is verified", async () => {
			const email = `match-${suffix}@example.com`;
			const res = await book(email);
			const unverified = await createUser(email);
			expect(
				(await as(unverified).events.ticketGet({ ticketCode: res.ticketCode }))
					.access,
			).toBe("limited");
			expect(
				(await as(unverified).events.participatedList()).map(
					(t) => t.ticketCode,
				),
			).not.toContain(res.ticketCode);

			await prisma.account.create({
				data: {
					userId: unverified,
					type: "oidc",
					provider: "google",
					providerAccountId: `g-${randomUUID()}`,
				},
			});
			expect(
				(await as(unverified).events.ticketGet({ ticketCode: res.ticketCode }))
					.access,
			).toBe("full");
		});
	});

	describe("dropping and transferring", () => {
		it("cannot drop with a code alone, even with the old email-confirmation field", async () => {
			const res = await book(`drop-${suffix}@example.com`);
			await expect(
				anonymous().events.ticketDrop({
					ticketCode: res.ticketCode,
					// Previously sufficient: the email was readable from the ticket page.
					confirmAttendeeEmail: `drop-${suffix}@example.com`,
				} as never),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			await expect(
				anonymous().events.ticketDrop({
					ticketCode: res.ticketCode,
					accessToken: res.accessToken,
				}),
			).resolves.toHaveProperty("success", true);
		});

		it("emails the transfer link to the recipient and never returns it", async () => {
			const res = await book(`sender-${suffix}@example.com`);
			await expect(
				anonymous().events.ticketTransferInitiate({
					ticketCode: res.ticketCode,
					recipientName: "Rae",
					recipientEmail: `attacker-${suffix}@example.com`,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			const recipientEmail = `recipient-${suffix}@example.com`;
			const out = await anonymous().events.ticketTransferInitiate({
				ticketCode: res.ticketCode,
				accessToken: res.accessToken,
				recipientName: "Rae Recipient",
				recipientEmail,
			});
			expect(valuesAtKey(out, "transferToken")).toEqual([]);

			const mail = transferEmails.find((m) => m.toEmail === recipientEmail);
			expect(mail?.senderFirstName).toBe("Sam");
			const transferToken = mail?.transferToken ?? "";

			const preview = await anonymous().events.ticketTransferGet({
				transferToken,
			});
			for (const key of [
				"qrToken",
				"attendeeEmail",
				"senderEmail",
				"attendeePhone",
			]) {
				expect(valuesAtKey(preview, key)).toEqual([]);
			}
			expect(preview.transfer.senderName).toBe("Sam");

			// Bind a guest cookie for the sender, then claim.
			expect(
				await bindGuestCheckinToken(prisma, res.accessToken),
			).not.toBeNull();
			const claimed = await anonymous().events.ticketTransferClaim({
				transferToken,
				attendeeName: "Rae Recipient",
				attendeeEmail: recipientEmail,
			});
			expect(claimed.ticketCode).not.toBe(res.ticketCode);

			// The sender's link and guest cookie no longer work; the new holder's does.
			await expect(
				anonymous().events.ticketGet({ accessToken: res.accessToken }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			const guest = await prisma.guestTicketToken.count({
				where: { issuedTicket: { ticketCode: claimed.ticketCode } },
			});
			expect(guest).toBe(0);
			expect(
				(
					await anonymous().events.ticketGet({
						accessToken: claimed.accessToken,
					})
				).access,
			).toBe("full");
			// Previous holder's personal details are not carried over.
			const moved = await prisma.issuedTicket.findUniqueOrThrow({
				where: { ticketCode: claimed.ticketCode },
				select: { attendeePhone: true, answers: true },
			});
			expect(moved).toEqual({ attendeePhone: null, answers: null });

			// Single use.
			await expect(
				anonymous().events.ticketTransferClaim({
					transferToken,
					attendeeName: "Rae Recipient",
					attendeeEmail: recipientEmail,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("dropping a ticket cancels its pending transfer, so it cannot be revived", async () => {
			const res = await book(`revive-${suffix}@example.com`);
			const recipientEmail = `revive-to-${suffix}@example.com`;
			await anonymous().events.ticketTransferInitiate({
				ticketCode: res.ticketCode,
				accessToken: res.accessToken,
				recipientName: "Late",
				recipientEmail,
			});
			const transferToken =
				transferEmails.find((m) => m.toEmail === recipientEmail)
					?.transferToken ?? "";
			await anonymous().events.ticketDrop({
				ticketCode: res.ticketCode,
				accessToken: res.accessToken,
			});

			await expect(
				anonymous().events.ticketTransferClaim({
					transferToken,
					attendeeName: "Late",
					attendeeEmail: recipientEmail,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			const row = await prisma.issuedTicket.findUniqueOrThrow({
				where: { ticketCode: res.ticketCode },
				select: { status: true },
			});
			expect(row.status).toBe("DROPPED");
		});
	});

	describe("resending a ticket link", () => {
		it("answers the same for unknown codes and real tickets", async () => {
			await expect(
				anonymous().events.ticketResendLink({ ticketCode: "OPT-ZZZZ-ZZZZ" }),
			).resolves.toHaveProperty("requested", true);
		});

		it("emails a fresh link once per cooldown and retires the old link", async () => {
			const res = await book(`resend-${suffix}@example.com`);
			const before = ticketEmails.length;

			await anonymous().events.ticketResendLink({ ticketCode: res.ticketCode });
			const sent = ticketEmails.slice(before);
			expect(sent).toHaveLength(1);
			expect(sent[0].toEmail).toBe(`resend-${suffix}@example.com`);
			await expect(
				anonymous().events.ticketGet({ accessToken: res.accessToken }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });

			// Within the cooldown: nothing rotates or sends.
			await anonymous().events.ticketResendLink({ ticketCode: res.ticketCode });
			expect(ticketEmails.length).toBe(before + 1);
			expect(
				(
					await anonymous().events.ticketGet({
						accessToken: sent[0].accessToken,
					})
				).access,
			).toBe("full");
		});
	});

	describe("guest check-in binding", () => {
		it("requires the link token, not the ticket code", async () => {
			const res = await book(`guest-${suffix}@example.com`);
			expect(await bindGuestCheckinToken(prisma, res.ticketCode)).toBeNull();
			expect(await bindGuestCheckinToken(prisma, "x".repeat(43))).toBeNull();
			expect(await bindGuestCheckinToken(prisma, res.accessToken)).toEqual(
				expect.any(String),
			);
		});
	});
});
