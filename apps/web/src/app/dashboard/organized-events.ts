import type { EventPhase, OrganizedEvent } from "./types";

/** The calendar day an instant falls on, in a given zone: "2026-11-24". */
function dayIn(instant: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

/**
 * Which status tab an event belongs to. A draft is a draft whatever its date;
 * otherwise the clock decides. "Today" is the event's own today, in its own
 * zone, so a late-evening event does not slip into tomorrow for an organizer
 * who is travelling. One that is running now counts as today too, even when
 * it began yesterday.
 */
export function phaseOf(event: OrganizedEvent, now: Date): EventPhase {
	if (!event.published || !event.startsAt || !event.endsAt) return "draft";

	const starts = new Date(event.startsAt);
	const ends = new Date(event.endsAt);
	const zone = event.timeZone ?? "UTC";
	if (now > ends) return "completed";
	if (now >= starts) return "today";
	return dayIn(starts, zone) === dayIn(now, zone) ? "today" : "upcoming";
}

/** Matches the search box: the event's name or its code, case ignored. */
function matches(event: OrganizedEvent, query: string): boolean {
	if (!query) return true;
	const needle = query.toLowerCase().replace(/^#/, "");
	return (
		event.title.toLowerCase().includes(needle) ||
		(event.code?.toLowerCase().includes(needle) ?? false)
	);
}

export type OrganizedListing = {
	/** What the search and status filter leave, in display order. */
	shown: readonly OrganizedEvent[];
	/** Per tab, after the search but before the status filter. */
	counts: Record<EventPhase, number>;
	/** Whether the workspace has any events at all, search aside. */
	hasAny: boolean;
};

/**
 * One pass over the workspace's events for everything the list draws. The
 * counts follow the search, so each tab says what clicking it would show.
 */
export function listOrganized(
	events: readonly OrganizedEvent[],
	query: string,
	phase: EventPhase | null,
	now: Date,
): OrganizedListing {
	const counts: Record<EventPhase, number> = {
		today: 0,
		draft: 0,
		upcoming: 0,
		completed: 0,
	};
	const ahead: OrganizedEvent[] = [];
	const past: OrganizedEvent[] = [];

	for (const event of events) {
		if (!matches(event, query)) continue;
		const own = phaseOf(event, now);
		counts[own] += 1;
		if (phase && own !== phase) continue;
		(own === "completed" ? past : ahead).push(event);
	}

	// What still needs work first, soonest at the top; then what has run,
	// most recent first.
	// Events without a date yet come after those with one, in the order given
	// (newest first).
	const byStart = (a: OrganizedEvent, b: OrganizedEvent) =>
		a.startsAt === b.startsAt
			? 0
			: a.startsAt === null
				? 1
				: b.startsAt === null
					? -1
					: a.startsAt.localeCompare(b.startsAt);
	ahead.sort(byStart);
	past.sort((a, b) => byStart(b, a));

	return { shown: [...ahead, ...past], counts, hasAny: events.length > 0 };
}

/** Up to three letters for the artwork placeholder: "AI & Spatial…" → "A&S". */
export function initialsOf(title: string): string {
	return title
		.split(/\s+/)
		.filter((word) => /^[\p{L}\p{N}&]/u.test(word))
		.slice(0, 3)
		.map((word) => word[0])
		.join("")
		.toUpperCase();
}
