import type { ManagedEvent } from "./load-event";
import {
	type ChoiceSplit,
	type Glance,
	glanceOf,
} from "./overview/glance-data";

/** Far beyond any event, but a bigint has no ceiling and a number does. */
export function toCount(value: bigint): number {
	return value > BigInt(Number.MAX_SAFE_INTEGER)
		? Number.MAX_SAFE_INTEGER
		: Number(value);
}

/**
 * The Glance card's figures for an event, as the Overview and Guests both
 * show it. Counts are the ones the database keeps per ticket, never a
 * COUNT(*) here.
 */
export function glanceFor(
	event: Pick<
		ManagedEvent,
		"status" | "startsAt" | "endsAt" | "timeZone" | "capacity" | "ticketTypes"
	>,
	lastRegisteredAt: Date | null,
	now: Date,
	/** From choiceSplit, for an event with one ticket. */
	split: ChoiceSplit | null = null,
): Glance {
	return glanceOf(
		{
			published: event.status === "published",
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			timeZone: event.timeZone,
			capacity: event.capacity,
			ticketTypes: event.ticketTypes,
			registered: new Map(
				event.ticketTypes.map((type) => [
					type.id,
					toCount(type.registeredCount),
				]),
			),
			lastRegisteredAt,
			split,
		},
		now,
	);
}

/** Everyone registered, from the counts kept per ticket. */
export function registeredTotal(
	event: Pick<ManagedEvent, "ticketTypes">,
): number {
	return event.ticketTypes.reduce(
		(sum, type) => sum + toCount(type.registeredCount),
		0,
	);
}
