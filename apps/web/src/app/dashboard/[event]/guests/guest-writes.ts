"use server";

import {
	type Answer,
	type FormField,
	normalizeTicketCode,
	readForm,
	readSubmission,
	recordId,
	utcToZoned,
} from "@makemyevent/core";
import { Prisma, type Tx } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { actingUser, bringingPeopleIn } from "@/lib/require-user";

/**
 * The team's changes to guests: adding one (Invite guest), correcting their
 * answers (Edit submission), cancelling and restoring. Each runs as the
 * person signed in; row-level security lets the owner, admins and
 * organizers write, and refuses a volunteer whatever is sent.
 *
 * Every submission is checked by readSubmission, the same rules the guest
 * form uses, against the form as it is now; hidden questions are dropped,
 * never stored.
 */

export type GuestFormValues = {
	ticketTypeId: string;
	answers: Record<string, Answer>;
	other: Record<string, string>;
};

export type GuestWriteResult =
	| { ok: true; id: string }
	| {
			ok: false;
			message: string;
			/** Problems by field id; "ticket" and "code" for those two. */
			problems?: Record<string, string>;
			/** Over capacity: the same call with force true goes ahead. */
			confirm?: boolean;
			/** The guest who already has this email. */
			existingId?: string;
	  };

const NOT_ALLOWED =
	"You can't change guests on this event. Ask its owner or an admin for the Organizer role.";

/** Thrown inside a transaction to end it, writing nothing, with a result. */
class Refused extends Error {
	constructor(readonly result: GuestWriteResult) {
		super("refused");
	}
}

async function formOf(tx: Tx, eventId: string): Promise<FormField[]> {
	const rows = await tx.formField.findMany({
		where: { eventId, archivedAt: null },
		orderBy: { position: "asc" },
		select: {
			id: true,
			kind: true,
			core: true,
			label: true,
			placeholder: true,
			help: true,
			required: true,
			settings: true,
			showIf: true,
		},
	});
	const read = readForm(rows);
	return read.ok ? read.fields : [];
}

/**
 * Places left on the ticket and at the event, if adding one guest would
 * pass either: the words to ask "add anyway?" with. Null when there's room.
 */
async function overCapacity(
	tx: Tx,
	eventId: string,
	ticketTypeId: string,
): Promise<string | null> {
	const event = await tx.event.findUnique({
		where: { id: eventId },
		select: {
			capacity: true,
			ticketTypes: {
				select: { id: true, name: true, capacity: true, registeredCount: true },
			},
		},
	});
	if (!event) return null;
	const ticket = event.ticketTypes.find((t) => t.id === ticketTypeId);
	if (ticket?.capacity != null && ticket.registeredCount >= ticket.capacity)
		return `${ticket.name} is full (${ticket.registeredCount} of ${ticket.capacity}).`;
	const total = event.ticketTypes.reduce(
		(sum, t) => sum + t.registeredCount,
		0n,
	);
	if (event.capacity != null && total >= event.capacity)
		return `The event is full (${total} of ${event.capacity}).`;
	return null;
}

async function checked(
	tx: Tx,
	eventId: string,
	input: GuestFormValues,
	selfId: string | null,
) {
	const event = await tx.event.findUnique({
		where: { id: eventId },
		select: { timeZone: true, ticketTypes: { select: { id: true } } },
	});
	if (!event) throw new Refused({ ok: false, message: NOT_ALLOWED });
	if (!event.ticketTypes.some((t) => t.id === input.ticketTypeId))
		throw new Refused({
			ok: false,
			message: "Choose a ticket.",
			problems: { ticket: "Choose a ticket." },
		});
	const fields = await formOf(tx, eventId);
	const today = utcToZoned(new Date(), event.timeZone ?? "UTC").date;
	const submission = readSubmission(fields, input, input.ticketTypeId, today);
	if (!submission.ok)
		throw new Refused({
			ok: false,
			message: submission.message,
			problems: submission.problems,
		});

	const emailField = fields.find((f) => f.core === "email");
	// One place per email at an event, as the team adds them.
	const existing = await tx.registration.findFirst({
		where: {
			eventId,
			attendeeEmail: submission.email,
			status: { not: "cancelled" },
			...(selfId ? { id: { not: selfId } } : {}),
		},
		select: { id: true, attendeeName: true },
	});
	if (existing)
		throw new Refused({
			ok: false,
			message: `${submission.email} is already a guest (${existing.attendeeName}).`,
			existingId: existing.id,
			...(emailField
				? { problems: { [emailField.id]: "Already a guest." } }
				: {}),
		});

	// The blocklist: the email by the database itself; phone answers here.
	// Like the email, it guards a new number, not one a guest already gave
	// before it was blocked: editing them must still work.
	const kept = new Set(
		selfId
			? (
					await tx.registrationAnswer.findMany({
						where: { registrationId: selfId },
						select: { value: true },
					})
				).flatMap((row) => (typeof row.value === "string" ? [row.value] : []))
			: [],
	);
	const phones = submission.rows
		.filter((row) => fields.find((f) => f.id === row.fieldId)?.kind === "phone")
		.map((row) => String(row.value))
		.filter((phone) => !kept.has(phone));

	if (phones.length > 0) {
		const blocked = await tx.blockedContact.findFirst({
			where: { eventId, kind: "phone", value: { in: phones } },
			select: { value: true },
		});
		if (blocked)
			throw new Refused({
				ok: false,
				message: `${blocked.value} is on this event's blocklist.`,
			});
	}
	return submission;
}

function failure(
	error: unknown,
	emailFieldId?: string,
): GuestWriteResult | null {
	if (error instanceof Refused) return error.result;
	const text = error instanceof Error ? error.message : "";
	if (/blocked contact/.test(text))
		return {
			ok: false,
			message: "That email is on this event's blocklist.",
			...(emailFieldId
				? { problems: { [emailFieldId]: "On the blocklist." } }
				: {}),
		};
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	)
		return {
			ok: false,
			message: "That ticket code is taken. Choose another.",
			problems: { code: "Taken. Choose another." },
		};
	if (/row-level security|permission denied/.test(text))
		return { ok: false, message: NOT_ALLOWED };
	return null;
}

async function storeAnswers(
	tx: Tx,
	eventId: string,
	registrationId: string,
	rows: {
		fieldId: string;
		value: string | string[] | boolean;
		otherText: string | null;
	}[],
) {
	// The whole submission replaces the last one: a question now hidden, or
	// now blank, loses its old answer.
	await tx.registrationAnswer.deleteMany({ where: { registrationId } });
	if (rows.length > 0)
		await tx.registrationAnswer.createMany({
			data: rows.map((row) => ({
				registrationId,
				eventId,
				fieldId: row.fieldId,
				value: row.value as Prisma.InputJsonValue,
				otherText: row.otherText,
			})),
		});
}

/**
 * Adds a guest the team invites, with their answers, on a ticket, with an
 * optional ticket code of the team's own. A full ticket or event asks
 * first; `force` goes ahead.
 */
export async function inviteGuest(
	eventId: string,
	input: GuestFormValues & { code: string | null; force: boolean },
): Promise<GuestWriteResult> {
	// A guest is someone else: the button sent them to set up two-step
	// sign-in first; this is for an action reached some other way.
	const user = await bringingPeopleIn("/dashboard");
	if (!recordId.safeParse(eventId).success)
		return { ok: false, message: NOT_ALLOWED };

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	let emailFieldId: string | undefined;
	try {
		const id = await asUser(user, async (tx) => {
			emailFieldId = (await formOf(tx, eventId)).find(
				(f) => f.core === "email",
			)?.id;
			const submission = await checked(tx, eventId, input, null);
			let code: string | undefined;
			if (input.code?.trim()) {
				const normalized = normalizeTicketCode(input.code);
				if (!normalized.ok)
					throw new Refused({
						ok: false,
						message: normalized.message,
						problems: { code: normalized.message },
					});
				code = normalized.code;
			}
			if (!input.force) {
				const full = await overCapacity(tx, eventId, input.ticketTypeId);
				if (full)
					throw new Refused({
						ok: false,
						confirm: true,
						message: `${full} Invite anyway?`,
					});
			}
			const created = await tx.registration.create({
				data: {
					eventId,
					ticketTypeId: input.ticketTypeId,
					attendeeName: submission.name,
					attendeeEmail: submission.email,
					status: "confirmed",
					source: "invite",
					...(code ? { ticketCode: code } : {}),
				},
				select: { id: true },
			});
			await storeAnswers(tx, eventId, created.id, submission.rows);
			return created.id;
		});
		revalidatePath("/dashboard/[event]/guests", "page");
		return { ok: true, id };
	} catch (error) {
		const result = failure(error, emailFieldId);
		if (result) return result;
		throw error;
	}
}

/** What Edit submission starts from: the guest's answers as the form holds them. */
export async function guestFormValues(
	eventId: string,
	registrationId: string,
): Promise<(GuestFormValues & { name: string }) | null> {
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
				attendeeName: true,
				attendeeEmail: true,
				ticketTypeId: true,
				answers: { select: { fieldId: true, value: true, otherText: true } },
			},
		});
		if (!guest) return null;
		const fields = await formOf(tx, eventId);
		const answers: Record<string, Answer> = {};
		const other: Record<string, string> = {};
		for (const row of guest.answers) {
			answers[row.fieldId] = row.value as Answer;
			if (row.otherText) other[row.fieldId] = row.otherText;
		}
		for (const field of fields) {
			if (field.core === "name") answers[field.id] = guest.attendeeName;
			if (field.core === "email") answers[field.id] = guest.attendeeEmail;
		}
		return {
			name: guest.attendeeName,
			ticketTypeId: guest.ticketTypeId,
			answers,
			other,
		};
	});
}

/** Corrects a guest's answers, name, email or ticket, and records who did. */
export async function editGuest(
	eventId: string,
	registrationId: string,
	input: GuestFormValues & { force: boolean },
): Promise<GuestWriteResult> {
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(registrationId).success
	)
		return { ok: false, message: NOT_ALLOWED };

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	let emailFieldId: string | undefined;
	try {
		await asUser(user, async (tx) => {
			emailFieldId = (await formOf(tx, eventId)).find(
				(f) => f.core === "email",
			)?.id;
			const before = await tx.registration.findFirst({
				where: { id: registrationId, eventId },
				select: {
					ticketTypeId: true,
					status: true,
					attendeeEmail: true,
					attendeeName: true,
				},
			});
			if (!before)
				throw new Refused({ ok: false, message: "That guest was not found." });
			const submission = await checked(tx, eventId, input, registrationId);
			const moving =
				before.ticketTypeId !== input.ticketTypeId &&
				before.status === "confirmed";
			if (moving && !input.force) {
				const full = await overCapacity(tx, eventId, input.ticketTypeId);
				if (full)
					throw new Refused({
						ok: false,
						confirm: true,
						message: `${full} Move them anyway?`,
					});
			}
			const { count } = await tx.registration.updateMany({
				where: { id: registrationId, eventId },
				data: {
					attendeeName: submission.name,
					attendeeEmail: submission.email,
					ticketTypeId: input.ticketTypeId,
				},
			});
			if (count === 0) throw new Refused({ ok: false, message: NOT_ALLOWED });
			// Which answers change, by question: what the record names.
			const previous = new Map(
				(
					await tx.registrationAnswer.findMany({
						where: { registrationId },
						select: { fieldId: true, value: true, otherText: true },
					})
				).map((row) => [
					row.fieldId,
					JSON.stringify([row.value, row.otherText]),
				]),
			);
			const next = new Map(
				submission.rows.map((row) => [
					row.fieldId,
					JSON.stringify([row.value, row.otherText]),
				]),
			);
			const changedAnswers = [
				...new Set([...previous.keys(), ...next.keys()]),
			].filter((fieldId) => previous.get(fieldId) !== next.get(fieldId));
			await storeAnswers(tx, eventId, registrationId, submission.rows);
			await tx.auditLog.create({
				data: {
					eventId,
					action: "guest.edit",
					targetId: registrationId,
					details: {
						...(before.attendeeEmail !== submission.email
							? { email: [before.attendeeEmail, submission.email] }
							: {}),
						...(before.attendeeName !== submission.name
							? { name: [before.attendeeName, submission.name] }
							: {}),
						...(before.ticketTypeId !== input.ticketTypeId
							? { ticket: [before.ticketTypeId, input.ticketTypeId] }
							: {}),
						// Which questions changed, not their answers: name and email are
						// recorded in full, being who the guest is; answers stay in their table.
						...(changedAnswers.length > 0 ? { answers: changedAnswers } : {}),
					},
				},
			});
		});
		revalidatePath("/dashboard/[event]/guests", "page");
		return { ok: true, id: registrationId };
	} catch (error) {
		const result = failure(error, emailFieldId);
		if (result) return result;
		throw error;
	}
}

/**
 * Cancels a guest's place, or gives it back. Cancelled guests leave the
 * list and the counts, keep their answers, and can be restored; restoring
 * to a full ticket asks first.
 */
export async function setCancelled(
	eventId: string,
	registrationId: string,
	cancelled: boolean,
	force = false,
): Promise<GuestWriteResult> {
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(registrationId).success
	)
		return { ok: false, message: NOT_ALLOWED };

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	try {
		await asUser(user, async (tx) => {
			const guest = await tx.registration.findFirst({
				where: { id: registrationId, eventId },
				select: { status: true, ticketTypeId: true },
			});
			if (!guest)
				throw new Refused({ ok: false, message: "That guest was not found." });
			if ((guest.status === "cancelled") === cancelled) return;
			if (!cancelled && !force) {
				const full = await overCapacity(tx, eventId, guest.ticketTypeId);
				if (full)
					throw new Refused({
						ok: false,
						confirm: true,
						message: `${full} Restore anyway?`,
					});
			}
			const { count } = await tx.registration.updateMany({
				where: { id: registrationId, eventId },
				data: { status: cancelled ? "cancelled" : "confirmed" },
			});
			if (count === 0) throw new Refused({ ok: false, message: NOT_ALLOWED });
			await tx.auditLog.create({
				data: {
					eventId,
					action: cancelled ? "guest.cancel" : "guest.restore",
					targetId: registrationId,
				},
			});
		});
		revalidatePath("/dashboard/[event]/guests", "page");
		return { ok: true, id: registrationId };
	} catch (error) {
		const result = failure(error);
		if (result) return result;
		throw error;
	}
}
