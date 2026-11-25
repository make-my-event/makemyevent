"use server";

import { recordId } from "@makemyevent/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { EMAIL_NOT_SET_UP, emailConfigured, sendEmail } from "@/lib/email";
import { whenText, whereText } from "@/lib/event-text";
import { masterKey, signPass } from "@/lib/pass-token";
import { qrPng, qrSvg } from "@/lib/qr";
import { limited } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/identity";
import { passHtml, passSubject, passText } from "./pass-email";

/**
 * A guest's pass: shown in the panel (View pass) and emailed (Resend).
 * Only for a confirmed guest. The QR holds a signed token, never an id.
 */

const NO_KEY =
	"Passes aren't set up on this site yet. It needs TICKET_SIGNING_KEY.";
/** One email per guest per minute, however often Resend is pressed. */
const RESEND_GAP_MS = 60_000;
/** Guests per call, so a big send is many short calls the page can follow. */
const BATCH = 10;

async function signedIn() {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fdashboard");
	return user;
}

export type PassView =
	| {
			ok: true;
			svg: string;
			name: string;
			ticketName: string;
			ticketCode: string;
			eventTitle: string;
			when: string | null;
	  }
	| { ok: false; message: string };

/** The pass as the guest's QR, for anyone on the team. */
export async function getPass(
	eventId: string,
	registrationId: string,
): Promise<PassView> {
	const user = await signedIn();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(registrationId).success
	)
		return { ok: false, message: "That guest was not found." };
	const master = masterKey();
	if (!master) return { ok: false, message: NO_KEY };
	const guest = await asUser(user.id, (tx) =>
		tx.registration.findFirst({
			where: { id: registrationId, eventId },
			select: {
				attendeeName: true,
				status: true,
				ticketCode: true,
				ticketType: { select: { name: true } },
				event: {
					select: {
						title: true,
						startsAt: true,
						timeZone: true,
						ticketKeyVersion: true,
					},
				},
			},
		}),
	);
	if (!guest) return { ok: false, message: "That guest was not found." };
	if (guest.status !== "confirmed")
		return { ok: false, message: "Only a guest with a place has a pass." };
	const token = signPass(master, {
		eventId,
		registrationId,
		version: guest.event.ticketKeyVersion,
	});
	return {
		ok: true,
		svg: await qrSvg(token),
		name: guest.attendeeName,
		ticketName: guest.ticketType.name,
		ticketCode: guest.ticketCode,
		eventTitle: guest.event.title,
		when: whenText(guest.event.startsAt, guest.event.timeZone),
	};
}

export type SendResult =
	| {
			ok: true;
			sent: number;
			/** Not sent, and why: a minute hasn't passed, cancelled, … */
			skipped: { name: string; reason: string }[];
			failed: { name: string; reason: string }[];
	  }
	| {
			ok: false;
			message: string;
			/** Too fast, or paused: nothing was sent; worth trying again after this many seconds. */
			retryAfter?: number;
	  };

/**
 * Emails passes to up to ten guests. Each email has the QR inside it and
 * the ticket code; a guest emailed less than a minute ago is skipped, so
 * Resend can't be used to flood someone. Written as sent, one by one, so a
 * failure part-way loses nothing already done.
 */
export async function sendPasses(
	eventId: string,
	registrationIds: string[],
): Promise<SendResult> {
	const user = await signedIn();
	const ids = [...new Set(registrationIds)];
	if (
		!recordId.safeParse(eventId).success ||
		ids.length === 0 ||
		ids.length > BATCH ||
		!ids.every((id) => recordId.safeParse(id).success)
	)
		return {
			ok: false,
			message: `Send passes to 1 to ${BATCH} guests at a time.`,
		};
	const master = masterKey();
	if (!master) return { ok: false, message: NO_KEY };
	if (!emailConfigured()) return { ok: false, message: EMAIL_NOT_SET_UP };

	const data = await asUser(user.id, async (tx) => {
		const event = await tx.event.findUnique({
			where: { id: eventId },
			select: {
				title: true,
				startsAt: true,
				timeZone: true,
				format: true,
				venueName: true,
				venueAddress: true,
				ticketKeyVersion: true,
			},
		});
		const guests = await tx.registration.findMany({
			where: { id: { in: ids }, eventId },
			select: {
				id: true,
				attendeeName: true,
				attendeeEmail: true,
				status: true,
				ticketCode: true,
				ticketSentAt: true,
				ticketType: { select: { name: true } },
			},
		});
		// Only those who manage the event send email: a volunteer is told so.
		const manages = await tx.$queryRaw<{ ok: boolean }[]>`
			SELECT app.manages_event(${eventId}::uuid) AS ok`;
		return { event, guests, manages: manages[0]?.ok === true };
	});
	if (!data.event) return { ok: false, message: "That event was not found." };
	if (!data.manages)
		return { ok: false, message: "You can't send passes for this event." };

	const slow = await limited(
		"passes.send",
		{ user: user.id },
		data.guests.length,
	);
	if (slow)
		return { ok: false, message: slow.message, retryAfter: slow.retryAfter };

	const event = data.event;
	const now = Date.now();
	const skipped: { name: string; reason: string }[] = [];
	const failed: { name: string; reason: string }[] = [];
	let sent = 0;
	for (const guest of data.guests) {
		if (guest.status !== "confirmed") {
			skipped.push({
				name: guest.attendeeName,
				reason: "no place (cancelled or waitlisted)",
			});
			continue;
		}
		if (
			guest.ticketSentAt &&
			now - guest.ticketSentAt.getTime() < RESEND_GAP_MS
		) {
			skipped.push({
				name: guest.attendeeName,
				reason: "emailed less than a minute ago",
			});
			continue;
		}
		const inbox = await limited("passes.recipient", {
			email: guest.attendeeEmail,
		});
		if (inbox) {
			failed.push({
				name: guest.attendeeName,
				reason: inbox.message.replace(/\.$/, ""),
			});
			continue;
		}
		const token = signPass(master, {
			eventId,
			registrationId: guest.id,
			version: event.ticketKeyVersion,
		});
		const png = await qrPng(token);
		const details = {
			guestName: guest.attendeeName,
			eventTitle: event.title,
			when: whenText(event.startsAt, event.timeZone),
			where: whereText(event),
			ticketName: guest.ticketType.name,
			ticketCode: guest.ticketCode,
			qrCid: "pass-qr",
		};
		const result = await sendEmail({
			to: guest.attendeeEmail,
			subject: passSubject(event.title),
			html: passHtml(details),
			text: passText(details),
			attachments: [
				{
					filename: `pass-${guest.ticketCode}.png`,
					content: png.toString("base64"),
					contentId: "pass-qr",
				},
			],
			// Within the minute, a retry of the same send is the same email.
			idempotencyKey: `pass:${guest.id}:${Math.floor(now / RESEND_GAP_MS)}`,
		});
		if (!result.ok) {
			failed.push({ name: guest.attendeeName, reason: result.message });
			// The service itself is unset or refusing: no point trying the rest.
			if (!result.retry && result.message === EMAIL_NOT_SET_UP) break;
			continue;
		}
		sent++;
		await asUser(user.id, (tx) =>
			tx.registration.updateMany({
				where: { id: guest.id, eventId },
				data: { ticketSentAt: new Date() },
			}),
		);
	}
	if (sent > 0) revalidatePath("/dashboard/[event]/guests", "page");
	return { ok: true, sent, skipped, failed };
}
