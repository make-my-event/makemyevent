"use server";

import {
	checkTicket,
	recordId,
	type TicketField,
	ticketInput,
} from "@makemyevent/core";
import { Prisma, type Tx } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { actingUser } from "@/lib/require-user";

/**
 * The Tickets section's writes, as the person signed in, under row-level
 * security: those who manage the event. The database holds every rule again
 * (the tickets migration); these turn its answers into words.
 */

export type TicketResult =
	| { ok: true; id: string }
	| { ok: false; field: TicketField | null; message: string };

const NOT_ALLOWED =
	"You can't change this event's tickets. Ask its owner or an admin for the Organizer role.";
/** Plenty for any event, and a bound on what one list draws. */
const TICKETS_MAX = 30;

function refused(message = NOT_ALLOWED): TicketResult {
	return { ok: false, field: null, message };
}

function refresh() {
	revalidatePath("/dashboard/[event]/tickets", "page");
	revalidatePath("/dashboard/[event]/guests", "page");
	revalidatePath("/dashboard/[event]/overview", "page");
}

/** What the database said, in words; null for anything else. */
function failure(error: unknown): TicketResult | null {
	const text = error instanceof Error ? error.message : "";
	if (/ticket over event capacity/.test(text))
		return {
			ok: false,
			field: "capacity",
			message: "A ticket can't have more places than the whole event.",
		};
	if (/ticket_types_free_until_payments/.test(text))
		return refused("Every ticket is free until payments are available.");
	if (/row-level security|permission denied/.test(text)) return refused();
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2003"
	)
		return refused(
			"Guests hold this ticket, so it can't be deleted. Close its sales instead.",
		);
	return null;
}

const ISO_DAY = (d: Date) => d.toISOString().slice(0, 10);

/** A new ticket at the end of the list, ready to be named. */
export async function createTicket(eventId: string): Promise<TicketResult> {
	const user = await actingUser();
	if (!recordId.safeParse(eventId).success) return refused();
	const slow = await limited("event.write", { user: user.id });
	if (slow) return refused(slow.message);
	try {
		const id = await asUser(user, async (tx) => {
			const held = await tx.ticketType.findMany({
				where: { eventId },
				select: { position: true },
			});
			if (held.length >= TICKETS_MAX) return null;
			const position = held.reduce((m, t) => Math.max(m, t.position + 1), 0);
			const created = await tx.ticketType.create({
				data: { eventId, name: "New ticket", position },
				select: { id: true },
			});
			return created.id;
		});
		if (!id) return refused(`An event can have up to ${TICKETS_MAX} tickets.`);
		refresh();
		return { ok: true, id };
	} catch (error) {
		const result = failure(error);
		if (result) return result;
		throw error;
	}
}

/** Everything the editor holds, checked, then saved together. */
export async function saveTicket(
	eventId: string,
	ticketId: string,
	raw: unknown,
): Promise<TicketResult> {
	const user = await actingUser();
	const parsed = ticketInput.safeParse(raw);
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(ticketId).success ||
		!parsed.success
	)
		return refused("That change could not be made.");
	const slow = await limited("event.write", { user: user.id });
	if (slow) return refused(slow.message);

	try {
		const outcome = await asUser(user, async (tx) => {
			const found = await tx.ticketType.findFirst({
				where: { id: ticketId, eventId },
				select: {
					registeredCount: true,
					event: {
						select: {
							capacity: true,
							days: { select: { id: true, day: true } },
						},
					},
				},
			});
			if (!found) return refused("That ticket was not found.");
			const days = found.event.days.map((d) => ({
				id: d.id,
				day: ISO_DAY(d.day),
			}));
			const checked = checkTicket(parsed.data, {
				eventCapacity:
					found.event.capacity === null ? null : Number(found.event.capacity),
				eventDays: days.map((d) => d.day),
				sold: Number(found.registeredCount),
			});
			if (!checked.ok)
				return {
					ok: false,
					field: checked.field,
					message: checked.message,
				} as const;
			const v = checked.values;
			const { count } = await tx.ticketType.updateMany({
				where: { id: ticketId, eventId },
				data: {
					name: v.name,
					description: v.description,
					capacity: v.capacity === null ? null : BigInt(v.capacity),
					maxPerPerson: v.maxPerPerson,
					inviteOnly: v.inviteOnly,
					multiDay: v.multiDay,
					transferable: v.transferable,
					waitlistEnabled: v.waitlistEnabled,
				},
			});
			if (count === 0) return refused();
			await saveDays(tx, eventId, ticketId, days, v.days);
			return { ok: true, id: ticketId } as const;
		});
		if (outcome.ok) refresh();
		return outcome;
	} catch (error) {
		const result = failure(error);
		if (result) return result;
		throw error;
	}
}

/** The days it admits, in place of the ones before. */
async function saveDays(
	tx: Tx,
	eventId: string,
	ticketId: string,
	eventDays: { id: bigint; day: string }[],
	chosen: string[],
) {
	await tx.ticketTypeDay.deleteMany({ where: { ticketTypeId: ticketId } });
	const ids = eventDays.filter((d) => chosen.includes(d.day)).map((d) => d.id);
	if (ids.length > 0)
		await tx.ticketTypeDay.createMany({
			data: ids.map((eventDayId) => ({
				ticketTypeId: ticketId,
				eventDayId,
				eventId,
			})),
		});
}

/** Stops or restarts registering for one ticket; who holds it keeps it. */
export async function setTicketClosed(
	eventId: string,
	ticketId: string,
	closed: boolean,
): Promise<TicketResult> {
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(ticketId).success ||
		typeof closed !== "boolean"
	)
		return refused();
	const slow = await limited("event.write", { user: user.id });
	if (slow) return refused(slow.message);
	const { count } = await asUser(user, (tx) =>
		tx.ticketType.updateMany({
			where: { id: ticketId, eventId },
			data: { closedAt: closed ? new Date() : null },
		}),
	);
	if (count === 0) return refused();
	refresh();
	return { ok: true, id: ticketId };
}

/**
 * Deletes a ticket no one holds. One that guests hold is closed instead, so
 * their passes keep working; and an event keeps at least one ticket.
 */
export async function deleteTicket(
	eventId: string,
	ticketId: string,
): Promise<TicketResult> {
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(ticketId).success
	)
		return refused();
	const slow = await limited("event.write", { user: user.id });
	if (slow) return refused(slow.message);
	try {
		const outcome = await asUser(user, async (tx) => {
			const [tickets, holders] = await Promise.all([
				tx.ticketType.count({ where: { eventId } }),
				tx.registration.count({ where: { eventId, ticketTypeId: ticketId } }),
			]);
			if (tickets <= 1)
				return refused(
					"An event needs at least one ticket. Add another first.",
				);
			if (holders > 0)
				return refused(
					"Guests hold this ticket, so it can't be deleted. Close its sales instead.",
				);
			const { count } = await tx.ticketType.deleteMany({
				where: { id: ticketId, eventId },
			});
			return count === 0 ? refused() : ({ ok: true, id: ticketId } as const);
		});
		if (outcome.ok) refresh();
		return outcome;
	} catch (error) {
		const result = failure(error);
		if (result) return result;
		throw error;
	}
}
