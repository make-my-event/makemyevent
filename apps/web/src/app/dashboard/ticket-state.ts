/**
 * What a ticket means for its holder right now, in one word and whether it
 * lets them in. Apart from the query, so it can be tested alone.
 */
export type TicketState = {
	/** Shown on the card and the pass; null when there is nothing to warn of. */
	label: string | null;
	/** Has a pass to show at the door. */
	hasPass: boolean;
	/** Over, or not going: listed after what is ahead. */
	past: boolean;
};

export function ticketState(
	ticket: { status: string; eventStatus: string; endsAt: Date | null },
	now: Date,
): TicketState {
	if (ticket.eventStatus === "cancelled")
		return { label: "Event cancelled", hasPass: false, past: true };
	if (ticket.status === "cancelled")
		return { label: "Cancelled", hasPass: false, past: true };
	const ended = ticket.endsAt !== null && ticket.endsAt < now;
	if (ticket.status === "waitlisted")
		return {
			label: ended ? "Ended" : "On the waitlist",
			hasPass: false,
			past: ended,
		};
	// The pass stays after the end: an event can run late.
	return { label: ended ? "Ended" : null, hasPass: true, past: ended };
}

type Listed = {
	status: string;
	eventStatus: string;
	startsAt: Date | null;
	endsAt: Date | null;
	eventTitle: string;
	ticketCode: string;
	venueName: string | null;
};

/**
 * The tickets someone still holds. One the host cancelled leaves their list;
 * its own address still opens, and says it was cancelled, for a guest who
 * follows an old link. A cancelled event stays: its guests need to know.
 */
export function heldTickets<T extends { status: string }>(
	tickets: readonly T[],
): T[] {
	return tickets.filter((ticket) => ticket.status !== "cancelled");
}

/**
 * In the order they matter: what is ahead, soonest first, then what has no
 * date yet, then the rest, latest first. Search reads the event's name, its
 * venue and the ticket's code, with or without its dashes.
 */
export function listTickets<T extends Listed>(
	tickets: readonly T[],
	query: string,
	now: Date,
): T[] {
	const needle = query.trim().toLowerCase();
	const code = needle.replace(/[\s-]/g, "");
	const matches = (ticket: T) =>
		!needle ||
		ticket.eventTitle.toLowerCase().includes(needle) ||
		(ticket.venueName?.toLowerCase().includes(needle) ?? false) ||
		(code !== "" &&
			ticket.ticketCode.toLowerCase().replace(/-/g, "").includes(code));
	const at = (ticket: T, missing: number) =>
		ticket.startsAt?.getTime() ?? missing;
	const found = tickets.filter(matches);
	const past = found.filter((ticket) => ticketState(ticket, now).past);
	const ahead = found.filter((ticket) => !past.includes(ticket));
	ahead.sort((a, b) => at(a, Infinity) - at(b, Infinity) || 0);
	past.sort((a, b) => at(b, 0) - at(a, 0));
	return [...ahead, ...past];
}
