import { zoneShort } from "@makemyevent/core";

/** An event's when and where as a pass says them, in its own time zone. */

/** "Sat, Dec 12, 2026, 9:30 AM GMT+5:30"; null without a date. */
export function whenText(
	start: Date | null,
	timeZone: string | null,
): string | null {
	if (!start) return null;
	return new Intl.DateTimeFormat("en-US", {
		timeZone: timeZone ?? "UTC",
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	}).format(start);
}

export function whereText(event: {
	format: string;
	venueName: string | null;
	venueAddress: string | null;
}): string | null {
	if (event.format === "online") return "Online: the link comes from the host";
	return (
		[event.venueName, event.venueAddress].filter(Boolean).join(", ") || null
	);
}

/** "Nov 24, 2026 · 11:00 AM GMT+5:30" for a card; "Date not set" without one. */
export function cardWhen(startsAt: string | null, timeZone: string | null) {
	if (!startsAt) return "Date not set";
	const starts = new Date(startsAt);
	const zone = timeZone ?? "UTC";
	const date = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		month: "short",
		day: "2-digit",
		year: "numeric",
	}).format(starts);
	const time = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hour: "numeric",
		minute: "2-digit",
	}).format(starts);
	return `${date} · ${time} ${zoneShort(starts, zone)}`;
}
