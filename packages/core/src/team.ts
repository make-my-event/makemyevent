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

/** Matching the event_members table's checks. */
export const MEMBER_NAME_MAX = 100;
const EMAIL_MAX = 320;

const memberName = z
	.string()
	.trim()
	.min(1, "Enter their name.")
	.max(MEMBER_NAME_MAX, `Keep the name under ${MEMBER_NAME_MAX} characters.`);

const memberRole = z.enum(MEMBER_ROLES, { error: "Choose a role." });

/** Add member: who, how to reach them, and what they may do. */
export const addMemberInput = z.object({
	name: memberName,
	email: z
		.string()
		.trim()
		.toLowerCase()
		.max(EMAIL_MAX, "That email is too long.")
		.pipe(z.email({ error: "Enter a valid email address." })),
	role: memberRole,
});

/** Edit member (the pencil): their name and role. The email stays. */
export const editMemberInput = z.object({
	name: memberName,
	role: memberRole,
});

/** A member's role alone, for the row's role menu. */
export const memberRoleInput = memberRole;

/** A row id sent back from the page: a UUID, or nothing is looked up. */
export const recordId = z.uuid();
