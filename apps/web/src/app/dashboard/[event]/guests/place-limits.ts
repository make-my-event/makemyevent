import type { Tx } from "@makemyevent/db";

/**
 * Place limits, as the database holds them (the place_limits migration).
 *
 * Every confirmed registration is checked against the event's limit and its
 * ticket's, under a lock on the event, and refused once either is full. The
 * team's own check before writing (overCapacity, and the import's) only
 * decides when to ask "add anyway?"; the database is what guarantees it.
 */

/**
 * The organizer said "add anyway?": this transaction may go past the
 * event's and its tickets' limits. Only someone who manages the event can
 * ask, and the database records each place it adds past a limit in the
 * audit log, with who, when and the counts at the time.
 */
export async function allowPastLimits(tx: Tx, eventId: string): Promise<void> {
	await tx.$executeRaw`SELECT app.allow_past_limits(${eventId}::uuid)`;
}

export type PastLimit = "event" | "ticket";

type Cause = { code?: unknown; message?: unknown };

/**
 * Which limit refused a write, if one did: the event's or the ticket's.
 * Null for any other error.
 */
export function pastLimit(error: unknown): PastLimit | null {
	if (!(error instanceof Error)) return null;
	const cause = (error as { meta?: { driverAdapterError?: { cause?: Cause } } })
		.meta?.driverAdapterError?.cause;
	const said = cause
		? cause.code === "23514" && typeof cause.message === "string"
			? cause.message
			: ""
		: (/Code: `23514`\. Message: `(event full|ticket full)`/.exec(
				error.message,
			)?.[1] ?? "");
	if (said === "event full") return "event";
	if (said === "ticket full") return "ticket";
	return null;
}

/** The words for a limit reached between the check and the write. */
export function fullNow(limit: PastLimit): string {
	return limit === "event"
		? "The event filled up just now."
		: "This ticket filled up just now.";
}

/** Asking to go past was refused: they don't manage this event. */
export function notAllowedPastLimits(error: unknown): boolean {
	return (
		error instanceof Error && /not allowed past limits/.test(error.message)
	);
}
