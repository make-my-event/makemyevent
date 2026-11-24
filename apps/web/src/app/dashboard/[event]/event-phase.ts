import type { EventPhase } from "../types";

export type PhaseInput = {
	published: boolean;
	startsAt: Date | null;
	endsAt: Date | null;
	timeZone: string | null;
};

/** The calendar day an instant falls on, in a given zone: "2026-11-24". */
export function dayIn(instant: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

/**
 * The same phases the Organized list's status tabs use, so an event is called
 * the same thing on both screens. A published event has its dates (the
 * database refuses one without), but a draft may not yet.
 */
export function eventPhase(event: PhaseInput, now: Date): EventPhase {
	const { published, startsAt, endsAt, timeZone } = event;
	if (!published || !startsAt || !endsAt) return "draft";
	if (now > endsAt) return "completed";
	if (now >= startsAt) return "today";
	const zone = timeZone ?? "UTC";
	return dayIn(startsAt, zone) === dayIn(now, zone) ? "today" : "upcoming";
}

/**
 * How far the event is, in whole days of its own calendar: 0 is today, 1
 * tomorrow, -2 the day before yesterday. Null without a date.
 */
export function daysUntil(
	startsAt: Date | null,
	timeZone: string | null,
	now: Date,
): number | null {
	if (!startsAt) return null;
	const zone = timeZone ?? "UTC";
	const day = (instant: Date) =>
		Date.parse(`${dayIn(instant, zone)}T00:00:00Z`);
	return Math.round((day(startsAt) - day(now)) / 86_400_000);
}
