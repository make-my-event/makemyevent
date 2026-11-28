"use server";

import {
	type Answer,
	answerText,
	type FieldSettings,
	isFieldKind,
	recordId,
} from "@makemyevent/core";
import { Prisma } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { actingUser } from "@/lib/require-user";
import { checkInDay as today } from "../check-in-day";

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
	checkIns: {
		at: string;
		by: string | null;
		day: string | null;
		/** The door that let them in, when the event has doors. */
		door: string | null;
	}[];
	answers: { id: string; label: string; text: string; removed: boolean }[];
};

const MAX_BATCH = 200;

/** One guest, for the panel: their ticket, check-ins and every answer. */
export async function getGuest(
	eventId: string,
	registrationId: string,
): Promise<GuestDetail | null> {
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(registrationId).success
	)
		return null;
	return asUser(user, async (tx) => {
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
						door: { select: { name: true } },
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
				door: c.door?.name ?? null,
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
	doorId?: string | null,
): Promise<CheckInResult> {
	return checkInMany(eventId, [registrationId], doorId);
}

/**
 * Lets guests in, for today, all or none. Guests already in are left as
 * they are; a cancelled guest, or anyone not on this event, is refused by
 * the database.
 */
export async function checkInMany(
	eventId: string,
	registrationIds: string[],
	/**
	 * The door this device's scanner is at, if any: with doors on, it's
	 * recorded (an assigned volunteer's own door is, whatever this says).
	 * A door removed since is dropped rather than failing the check-in.
	 */
	doorId?: string | null,
): Promise<CheckInResult> {
	const user = await actingUser();
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
	const door =
		typeof doorId === "string" && recordId.safeParse(doorId).success
			? doorId
			: null;
	const write = (withDoor: string | null) =>
		asUser(user, async (tx) => {
			const day = await today(tx, eventId);
			if (!day.ok) return day;
			await tx.checkIn.createMany({
				data: ids.map((registrationId) => ({
					registrationId,
					eventId,
					eventDayId: day.dayId,
					method: "manual",
					doorId: withDoor,
				})),
				skipDuplicates: true,
			});
			return { ok: true } as const;
		});
	try {
		let result: Awaited<ReturnType<typeof write>>;
		try {
			result = await write(door);
		} catch (error) {
			// The remembered door was removed, or this volunteer is held to
			// another: send none, and the database records theirs or none.
			if (
				door &&
				error instanceof Error &&
				/door not open|not your door/.test(error.message)
			)
				result = await write(null);
			else throw error;
		}
		if (result.ok) revalidatePath("/dashboard/[event]/guests", "page");
		return result;
	} catch (error) {
		if (isDuplicate(error)) return { ok: true };
		// Their ticket's own days (the tickets migration).
		const said =
			error instanceof Error
				? `${String((error as { meta?: { driverAdapterError?: { cause?: { message?: unknown } } } }).meta?.driverAdapterError?.cause?.message ?? "")} ${error.message}`
				: "";
		if (/one entry used/.test(said))
			return {
				ok: false,
				message:
					"Their ticket lets them in once, and they were checked in on another day.",
			};
		if (/not this day/.test(said))
			return { ok: false, message: "Their ticket doesn't admit them today." };
		if (/not your door/.test(said))
			return {
				ok: false,
				message:
					"You're assigned to another door. Ask an organizer to move you.",
			};
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
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(registrationId).success
	)
		return { ok: false, message: "That guest was not found." };

	const slow = await limited("guest.check_in", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	const result = await asUser(user, async (tx) => {
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
