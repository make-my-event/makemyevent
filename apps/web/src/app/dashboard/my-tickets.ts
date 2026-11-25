import "server-only";
import type { Tx } from "@makemyevent/db";

/**
 * A ticket as its holder sees it: their place, and what it says of the
 * event. Read through app.my_tickets(), which answers only for the person
 * the transaction runs as and shows nothing else of an event that is still
 * a draft.
 */
export type MyTicket = {
	id: string;
	eventId: string;
	eventTitle: string;
	eventStatus: string;
	startsAt: Date | null;
	endsAt: Date | null;
	timeZone: string | null;
	format: string;
	venueName: string | null;
	venueAddress: string | null;
	/** Only while they hold a place at an event that is on. */
	onlineUrl: string | null;
	posterPath: string | null;
	ticketKeyVersion: number;
	ticketName: string;
	ticketCode: string;
	attendeeName: string;
	status: string;
};

export function myTickets(tx: Tx, only?: string): Promise<MyTicket[]> {
	return tx.$queryRaw<MyTicket[]>`
		SELECT id, event_id AS "eventId", event_title AS "eventTitle",
			event_status AS "eventStatus", starts_at AS "startsAt",
			ends_at AS "endsAt", time_zone AS "timeZone", format,
			venue_name AS "venueName", venue_address AS "venueAddress",
			online_url AS "onlineUrl", poster_path AS "posterPath",
			ticket_key_version AS "ticketKeyVersion", ticket_name AS "ticketName",
			ticket_code AS "ticketCode", attendee_name AS "attendeeName", status
		FROM app.my_tickets(${only ?? null}::uuid)
	`;
}
