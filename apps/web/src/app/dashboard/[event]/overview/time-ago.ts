const days = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the words a person would use: "Just now", "5 min ago",
 * "3 h ago", "yesterday", "4 days ago". Past a month it is the date itself,
 * in the event's zone, since "37 days ago" means nothing at a glance.
 */
export function timeAgo(at: Date, now: Date, timeZone: string | null): string {
	const elapsed = Math.max(0, now.getTime() - at.getTime());
	if (elapsed < MINUTE) return "Just now";
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
	if (elapsed < 30 * DAY) return days.format(-Math.floor(elapsed / DAY), "day");
	return new Intl.DateTimeFormat("en-US", {
		timeZone: timeZone ?? "UTC",
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(at);
}

/** The exact moment, for hover: "Nov 20, 2026, 10:37 PM GMT+5:30". */
export function exactTime(at: Date, timeZone: string | null): string {
	return new Intl.DateTimeFormat("en-US", {
		timeZone: timeZone ?? "UTC",
		dateStyle: "medium",
		timeStyle: "short",
	}).format(at);
}
