import { z } from "zod";

/**
 * A ticket's settings as the Tickets section edits them, checked the same
 * way in the browser and on the server. The database holds the same rules
 * (the tickets migration) for any write that gets past these.
 */

export const TICKET_NAME_MAX = 80;
export const TICKET_DESCRIPTION_MAX = 500;
/** More per person than anyone sensibly buys at once. */
export const PER_PERSON_MAX = 50;

/** As the form sends it: switches, and the numbers beside them as typed. */
export const ticketInput = z.object({
	name: z.string(),
	description: z.string(),
	capped: z.boolean(),
	capacity: z.string(),
	limitPerPerson: z.boolean(),
	maxPerPerson: z.string(),
	inviteOnly: z.boolean(),
	multiDay: z.boolean(),
	/** The days it admits, "2026-12-10", or empty for every day. */
	days: z.array(z.string()).max(400),
	transferable: z.boolean(),
	waitlist: z.boolean(),
});
export type TicketInput = z.infer<typeof ticketInput>;

export type TicketField =
	| "name"
	| "description"
	| "capacity"
	| "maxPerPerson"
	| "days";

export type TicketValues = {
	name: string;
	description: string;
	/** Null: shares the event's places. */
	capacity: number | null;
	maxPerPerson: number | null;
	inviteOnly: boolean;
	multiDay: boolean;
	days: string[];
	transferable: boolean;
	waitlistEnabled: boolean;
};

type Checked =
	| { ok: true; values: TicketValues }
	| { ok: false; field: TicketField; message: string };

function whole(text: string): number | null {
	const t = text.trim();
	return /^\d{1,9}$/.test(t) ? Number(t) : null;
}

/**
 * Turns the form into what is stored, or says which field is wrong.
 *
 * `eventCapacity` is the event's own limit (null: none). `eventDays` are the
 * days it runs, when more than one. `sold` is how many hold this ticket now:
 * its limit can go down to that, not below.
 */
export function checkTicket(
	input: TicketInput,
	context: {
		eventCapacity: number | null;
		eventDays: readonly string[];
		sold: number;
	},
): Checked {
	const fail = (field: TicketField, message: string): Checked => ({
		ok: false,
		field,
		message,
	});
	const name = input.name.trim().replace(/\s+/g, " ");
	if (!name) return fail("name", "Give the ticket a name.");
	if (name.length > TICKET_NAME_MAX)
		return fail("name", `Keep the name under ${TICKET_NAME_MAX} characters.`);
	const description = input.description.trim();
	if (description.length > TICKET_DESCRIPTION_MAX)
		return fail(
			"description",
			`Keep it under ${TICKET_DESCRIPTION_MAX} characters.`,
		);

	let capacity: number | null = null;
	if (input.capped) {
		capacity = whole(input.capacity);
		if (capacity === null || capacity < 1)
			return fail("capacity", "Enter how many places, 1 or more.");
		if (context.eventCapacity !== null && capacity > context.eventCapacity)
			return fail(
				"capacity",
				`The whole event has ${context.eventCapacity} places, so a ticket can have up to ${context.eventCapacity}.`,
			);
		if (capacity < context.sold)
			return fail(
				"capacity",
				`${context.sold} people already hold this ticket, so it needs at least ${context.sold} places.`,
			);
	}

	let maxPerPerson: number | null = null;
	if (input.limitPerPerson) {
		maxPerPerson = whole(input.maxPerPerson);
		const most = Math.min(
			PER_PERSON_MAX,
			capacity ?? context.eventCapacity ?? PER_PERSON_MAX,
		);
		if (maxPerPerson === null || maxPerPerson < 1 || maxPerPerson > most)
			return fail("maxPerPerson", `Enter a number from 1 to ${most}.`);
	}

	const known = new Set(context.eventDays);
	const days = [...new Set(input.days)].sort();
	if (input.multiDay && days.some((day) => !known.has(day)))
		return fail("days", "Choose from the event's days.");

	return {
		ok: true,
		values: {
			name,
			description,
			capacity,
			maxPerPerson,
			inviteOnly: input.inviteOnly,
			multiDay: input.multiDay,
			// Every day is the same as none chosen: stored as none.
			days:
				input.multiDay && days.length < context.eventDays.length ? days : [],
			transferable: input.transferable,
			waitlistEnabled: input.waitlist,
		},
	};
}

export type TicketStatus = "on_sale" | "sold_out" | "closed";

/**
 * Where a ticket stands for someone registering: closed by the host, out of
 * places (its own, or the event's), or on sale.
 */
export function ticketStatus(
	ticket: {
		closedAt: Date | string | null;
		capacity: number | null;
		registered: number;
	},
	event: { capacity: number | null; registered: number },
): TicketStatus {
	if (ticket.closedAt) return "closed";
	if (ticket.capacity !== null && ticket.registered >= ticket.capacity)
		return "sold_out";
	if (event.capacity !== null && event.registered >= event.capacity)
		return "sold_out";
	return "on_sale";
}
