import type { EventRole } from "@makemyevent/core";

/**
 * Which sections each role opens. Volunteers run the door: the overview, the
 * guest list and the scanner. Everyone else on the team opens every section.
 *
 * This decides what the sidebar shows and which pages let someone in; the
 * database's row-level security decides what each role can read and change,
 * whatever a page shows.
 */
const VOLUNTEER_SECTIONS: ReadonlySet<string> = new Set([
	"overview",
	"guests",
	"scan-qr",
]);

export function opensSection(role: EventRole, section: string): boolean {
	return role !== "volunteer" || VOLUNTEER_SECTIONS.has(section);
}

/**
 * Every section's name, by its address segment. The sidebar draws them; a
 * section without a page of its own yet shows a placeholder under its name.
 */
export const SECTION_LABELS: Readonly<Record<string, string>> = {
	overview: "Overview",
	edit: "Event Page",
	"form-builder": "Form Builder",
	rsvp: "RSVP",
	cfp: "CFP",
	guests: "Guests",
	"scan-qr": "Scan QR",
	"post-event": "Post Event",
	schedule: "Schedule",
	tickets: "Tickets",
	partners: "Partners & Sponsors",
};
