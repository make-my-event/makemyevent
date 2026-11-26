import { z } from "zod";

/**
 * What someone can be to an event. The owner is its host; the others are
 * people the owner or an admin adds. The database's app.team_role() gives the
 * same answers, and its row-level security enforces them; these are for
 * showing and checking the same rules in the interface.
 *
 *   owner      everything
 *   admin      everything, the team included, except deleting the event
 *   organizer  the event page, tickets and guests; not the team
 *   volunteer  the guest list and check-in only
 */
export const MEMBER_ROLES = ["admin", "organizer", "volunteer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type EventRole = "owner" | MemberRole;

export const ROLE_LABELS: Record<EventRole, string> = {
	owner: "Owner",
	admin: "Admin",
	organizer: "Organizer",
	volunteer: "Volunteer",
};

/** Whether a role may add, change and remove team members. */
export function managesTeam(role: EventRole): boolean {
	return role === "owner" || role === "admin";
}

/** Whether a role may edit the event, its tickets and its guests. */
export function managesEvent(role: EventRole): boolean {
	return role !== "volunteer";
}

/** Matching the event_members table's check. */
const EMAIL_MAX = 320;

const memberRole = z.enum(MEMBER_ROLES, { error: "Choose a role." });

/**
 * Add member: their email and what they may do. Their name is their own,
 * from their account when they join.
 */
export const addMemberInput = z.object({
	email: z
		.string()
		.trim()
		.toLowerCase()
		.max(EMAIL_MAX, "That email is too long.")
		.pipe(z.email({ error: "Enter a valid email address." })),
	role: memberRole,
});

/** A member's role alone, for the row's role menu. */
export const memberRoleInput = memberRole;

/** A row id sent back from the page: a UUID, or nothing is looked up. */
export const recordId = z.uuid();
