import "server-only";
import type { EventRole, MemberRole } from "@makemyevent/core";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { asUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/identity";
import { claimInvites } from "../claim-invites";
import { opensSection } from "./sections";

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * One query for the event, the reader's role on it, and what the sections
 * share: its own fields and its ticket types.
 */
async function queryEvent(slug: string, userId: string) {
	const event = await asUser(userId, (tx) =>
		tx.event.findUnique({
			where: { slug },
			select: {
				id: true,
				slug: true,
				title: true,
				status: true,
				hostUserId: true,
				startsAt: true,
				endsAt: true,
				timeZone: true,
				capacity: true,
				// The Event Page tab's own fields: small, and on the same row.
				listed: true,
				registrationPausedAt: true,
				posterPath: true,
				posterAlt: true,
				logoPath: true,
				// A handful per event, on an (event_id, position) index; the
				// Overview and Tickets sections both show them.
				ticketTypes: {
					select: {
						id: true,
						name: true,
						capacity: true,
						// Kept by a trigger; a read, not a count.
						registeredCount: true,
						inviteOnly: true,
					},
					orderBy: [{ position: "asc" }, { createdAt: "asc" }],
				},
				// Their own membership, if any: on the (event_id, user_id) key.
				members: {
					where: { userId },
					select: { role: true },
					take: 1,
				},
			},
		}),
	);
	if (!event) return null;
	const { members, ...rest } = event;
	// A published event is readable by anyone under row-level security, so
	// the role is what says this person runs it.
	const role: EventRole | null =
		event.hostUserId === userId
			? "owner"
			: ((members[0]?.role as MemberRole | undefined) ?? null);
	// viewerId: who is reading, for the section's own queries, which must run
	// as them (never as the host) so their role's limits apply.
	return role ? { ...rest, role, viewerId: userId } : null;
}

export type ManagedEvent = NonNullable<Awaited<ReturnType<typeof queryEvent>>>;

/**
 * The event for this request, shared by the layout's header and the
 * section's page through cache().
 *
 * Not found, or not theirs: they may have been invited and not yet claimed
 * it (they followed the dashboard link from the host). Claiming runs then,
 * once, and the event is looked up again; anyone else gets the same answer
 * as before.
 */
const resolveEvent = cache(
	async (slug: string, user: SignedInUser): Promise<ManagedEvent | null> => {
		const found = await queryEvent(slug, user.id);
		if (found) return found;
		const claimed = await asUser(user.id, (tx) => claimInvites(tx, user));
		return claimed > 0 ? queryEvent(slug, user.id) : null;
	},
);

/**
 * The event a dashboard section is about, for someone on its team whose role
 * opens that section. This is the gate: every section's page calls it.
 *
 * Signed out goes to sign-in and back. Not on the team, or a section their
 * role does not open: "not found", the same answer as an address that does
 * not exist, so the dashboard never confirms that someone else's event is
 * there.
 */
export async function loadManagedEvent(
	slug: string,
	section: string,
): Promise<ManagedEvent> {
	const user = await getCurrentUser();
	if (!user)
		redirect(
			`/signin?next=${encodeURIComponent(`/dashboard/${encodeURIComponent(slug)}/${section}`)}`,
		);
	const event = await resolveEvent(slug, user);
	if (!event || !opensSection(event.role, section)) notFound();
	return event;
}

/**
 * The same event for the layout (its header and sidebar), without the
 * gate's answers: the layout does not know which section was asked for, so
 * it shows nothing and leaves sign-in and "not found" to the page.
 */
export async function findManagedEvent(
	slug: string,
): Promise<ManagedEvent | null> {
	const user = await getCurrentUser();
	return user ? resolveEvent(slug, user) : null;
}
