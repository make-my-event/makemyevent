"use server";

import {
	type Answer,
	answerText,
	type FieldSettings,
	isFieldKind,
	recordId,
	utcToZoned,
} from "@makemyevent/core";
import { Prisma, type Tx } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/identity";

/**
 * The Guests tab's reads and writes beyond the list, each as the person
 * signed in, under row-level security: the whole team (volunteers too) sees
 * guests and checks them in; the database refuses anyone else.
 */

export type GuestDetail = {
	id: string;
	name: string;
	email: string;
	status: string;
	source: string;
	ticketName: string;
	ticketCode: string;
	registeredAt: string;
	/** When the pass was last emailed; null if never. */
	ticketSentAt: string | null;
	invitedBy: string | null;
	checkIns: { at: string; by: string | null; day: string | null }[];
	answers: { id: string; label: string; text: string; removed: boolean }[];
};

const MAX_BATCH = 200;

async function signedIn() {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fdashboard");
	return user;
}

/** One guest, for the panel: their ticket, check-ins and every answer. */
export async function getGuest(
	eventId: string,
	registrationId: string,
): Promise<GuestDetail | null> {
	const user = await signedIn();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(registrationId).success
	)
		return null;
	return asUser(user.id, async (tx) => {
		const guest = await tx.registration.findFirst({
			where: { id: registrationId, eventId },
			select: {
				id: true,
				attendeeName: true,
				attendeeEmail: true,
				status: true,
				source: true,
				ticketCode: true,
				createdAt: true,
				ticketSentAt: true,
				ticketType: { select: { name: true } },
				invitedBy: { select: { displayName: true } },
				checkIns: {
					orderBy: { checkedInAt: "asc" },
					select: {
						checkedInAt: true,
						by: { select: { displayName: true } },
						eventDay: { select: { day: true } },
					},
				},
				answers: { select: { fieldId: true, value: true, otherText: true } },
			},
		});
		if (!guest) return null;
		// The form in order, archived questions after it: an answer to a
		// question since removed is still the guest's answer.
		const fields = await tx.formField.findMany({
			where: { eventId, core: null },
			orderBy: [
				{ archivedAt: { sort: "asc", nulls: "first" } },
				{ position: "asc" },
			],
			select: {
				id: true,
				kind: true,
				label: true,
				settings: true,
				archivedAt: true,
			},
		});
		const answers = new Map(guest.answers.map((a) => [a.fieldId, a]));
		return {
			id: guest.id,
			name: guest.attendeeName,
			email: guest.attendeeEmail,
			status: guest.status,
			source: guest.source,
			ticketName: guest.ticketType.name,
			ticketCode: guest.ticketCode,
			registeredAt: guest.createdAt.toISOString(),
			ticketSentAt: guest.ticketSentAt?.toISOString() ?? null,
			invitedBy: guest.invitedBy?.displayName ?? null,
			checkIns: guest.checkIns.map((c) => ({
				at: c.checkedInAt.toISOString(),
				by: c.by?.displayName ?? null,
				day: c.eventDay ? c.eventDay.day.toISOString().slice(0, 10) : null,
			})),
			answers: fields.flatMap((field) => {
				const answer = answers.get(field.id);
				if (!isFieldKind(field.kind)) return [];
				const text = answer
					? answerText(
							{ kind: field.kind, settings: field.settings as FieldSettings },
							answer.value as Answer,
							answer.otherText,
						)
					: "";
				// Removed questions only when this guest answered them.
				if (field.archivedAt && !text) return [];
				if (field.kind === "heading") return [];
				return [
					{
						id: field.id,
						label: field.label,
						text,
						removed: field.archivedAt !== null,
					},
				];
			}),
		};
	});
}

export type CheckInResult = { ok: true } | { ok: false; message: string };

/**
 * Which event day a check-in now counts for: today, on the event's own
 * clock. An event without days has one check-in in all (null). Checking in
 * on a day the event doesn't run is refused, so a pass can't be used up on
 * the wrong day.
 */
async function today(
	tx: Tx,
	eventId: string,
): Promise<
	{ ok: true; dayId: bigint | null } | { ok: false; message: string }
> {
	const event = await tx.event.findUnique({
		where: { id: eventId },
		select: { timeZone: true, days: { select: { id: true, day: true } } },
	});
	if (!event) return { ok: false, message: "That event was not found." };
	if (event.days.length === 0) return { ok: true, dayId: null };
	const date = utcToZoned(new Date(), event.timeZone ?? "UTC").date;
	const match = event.days.find(
		(d) => d.day.toISOString().slice(0, 10) === date,
	);
	return match
		? { ok: true, dayId: match.id }
		: {
				ok: false,
				message: "The event doesn't run today, so no one can check in yet.",
			};
}

function isDuplicate(error: unknown) {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

/** Lets one guest in, for today. Already in counts as done. */
export async function checkIn(
	eventId: string,
	registrationId: string,
): Promise<CheckInResult> {
	return checkInMany(eventId, [registrationId]);
}

/**
 * Lets guests in, for today, all or none. Guests already in are left as
 * they are; a cancelled guest, or anyone not on this event, is refused by
 * the database.
 */
export async function checkInMany(
	eventId: string,
	registrationIds: string[],
): Promise<CheckInResult> {
	const user = await signedIn();
	const ids = [...new Set(registrationIds)];
	if (
		!recordId.safeParse(eventId).success ||
		ids.length === 0 ||
		ids.length > MAX_BATCH ||
		!ids.every((id) => recordId.safeParse(id).success)
	)
		return { ok: false, message: "Choose up to 200 guests to check in." };

	const slow = await limited("guest.check_in", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	try {
		const result = await asUser(user.id, async (tx) => {
			const day = await today(tx, eventId);
			if (!day.ok) return day;
			await tx.checkIn.createMany({
				data: ids.map((registrationId) => ({
					registrationId,
					eventId,
					eventDayId: day.dayId,
					method: "manual",
				})),
				skipDuplicates: true,
			});
			return { ok: true } as const;
		});
		if (result.ok) revalidatePath("/dashboard/[event]/guests", "page");
		return result;
	} catch (error) {
		if (isDuplicate(error)) return { ok: true };
		// A row-level security refusal: a cancelled guest, or not this event.
		// Anything else is a fault, and surfaces as one.
		if (error instanceof Error && /row-level security/.test(error.message))
			return {
				ok: false,
				message:
					"Some of these guests can't be checked in: cancelled, or not on this event.",
			};
		throw error;
	}
}

/** Takes back today's check-in, and records who did. */
export async function undoCheckIn(
	eventId: string,
	registrationId: string,
): Promise<CheckInResult> {
	const user = await signedIn();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(registrationId).success
	)
		return { ok: false, message: "That guest was not found." };

	const slow = await limited("guest.check_in", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	const result = await asUser(user.id, async (tx) => {
		const day = await today(tx, eventId);
		const dayId = day.ok ? day.dayId : null;
		const { count } = await tx.checkIn.deleteMany({
			where: { eventId, registrationId, eventDayId: dayId },
		});
		if (count === 0)
			return { ok: false, message: "They weren't checked in today." } as const;
		await tx.auditLog.create({
			data: {
				eventId,
				action: "check_in.undo",
				targetId: registrationId,
				details: { day: dayId === null ? null : dayId.toString() },
			},
		});
		return { ok: true } as const;
	});
	if (result.ok) revalidatePath("/dashboard/[event]/guests", "page");
	return result;
}
