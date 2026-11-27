/**
 * The door scanner's rules that need no database: every answer a scan can
 * get and how it is said, which of three kinds it is (let in, already in,
 * stop), reading a typed ticket code, and ignoring a code the camera keeps
 * seeing. The server decides the answer; the screen and the sounds follow
 * from the kind.
 */

export const SCAN_OUTCOMES = [
	"admitted",
	"already_in",
	"cancelled",
	"waitlisted",
	"not_today",
	"used_elsewhere",
	"other_event",
	"reissued",
	"unknown",
	"not_running",
] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

/** admit: let them in. again: already in, check. stop: don't let them in. */
export type ScanKind = "admit" | "again" | "stop";

export function scanKind(outcome: ScanOutcome): ScanKind {
	if (outcome === "admitted") return "admit";
	if (outcome === "already_in") return "again";
	return "stop";
}

/** The big word on the screen, and the line under it for a refusal. */
export const SCAN_WORDS: Record<
	ScanOutcome,
	{ title: string; detail: string }
> = {
	admitted: { title: "Admitted", detail: "" },
	already_in: { title: "Already in", detail: "" },
	cancelled: {
		title: "Not valid",
		detail: "This ticket was cancelled. Send them to the help desk.",
	},
	waitlisted: {
		title: "No place yet",
		detail: "They're on the waiting list, not let in yet.",
	},
	not_today: {
		title: "Not today",
		detail: "Their ticket doesn't admit them today.",
	},
	used_elsewhere: {
		title: "Already used",
		detail: "Their ticket lets them in once, and they came in on another day.",
	},
	other_event: {
		title: "Wrong event",
		detail: "This ticket is for a different event.",
	},
	reissued: {
		title: "Old code",
		detail: "This pass was reissued. Ask for the newest email from the event.",
	},
	unknown: {
		title: "Not a ticket",
		detail:
			"This isn't a ticket for this event. Check the code, or send them to the help desk.",
	},
	not_running: {
		title: "No doors today",
		detail: "The event doesn't run today, so no one can be let in.",
	},
};

/**
 * A ticket code as staff type it, read the way the database writes it:
 * MME-XXXX-XXXX from 0-9 and A-Z without I, L, O and U. Spaces, dashes and
 * case don't matter, and the letters people mistake for digits are read as
 * the digits. Null when it can't be one.
 */
export function readTicketCode(typed: string): string | null {
	const plain = typed
		.toUpperCase()
		.replace(/[\s-]/g, "")
		.replace(/^MME/, "")
		.replace(/O/g, "0")
		.replace(/[IL]/g, "1");
	if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(plain)) return null;
	return `MME-${plain.slice(0, 4)}-${plain.slice(4)}`;
}

/**
 * Ignores a code seen again within `ms` of the last time it was read: a
 * guest holding their phone up shouldn't check in, beep and buzz on every
 * frame. Another code is always read at once.
 */
export function repeatGuard(ms: number) {
	let last: { text: string; at: number } | null = null;
	return (text: string, now: number): boolean => {
		if (last && last.text === text && now - last.at < ms) return false;
		last = { text, at: now };
		return true;
	};
}
