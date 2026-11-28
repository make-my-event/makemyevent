import "server-only";
import type { EventRole } from "@makemyevent/core";
import { notFound } from "next/navigation";
import type { Person } from "@makemyevent/db";
import { cache } from "react";
import { asUser } from "@/lib/db";
import { requireUser, twoStepFirst } from "@/lib/require-user";
import { type CurrentUser, getCurrentUser } from "@/lib/supabase/identity";
import { claimInvites } from "../claim-invites";
import { opensSection } from "./sections";

/**
 * One query for the event, the reader's role on it, and what the sections
 * share: its own fields and its ticket types.
 */
async function queryEvent(slug: string, user: CurrentUser) {
	const found = await asUser(user, async (tx) => {
		const event = await tx.event.findUnique({
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
			},
		});
		if (!event) return null;
		// Their role, as every policy sees it: the database's one answer, two
		// steps and private drafts included. A published event is readable by
		// anyone, so this, not finding it, says they run it.
		const [row] = await tx.$queryRaw<{ role: EventRole | null }[]>`
			SELECT app.team_role(${event.id}::uuid) AS role
		`;
		return { event, role: row?.role ?? null };
	});
	if (!found?.role) return null;
	const { event: rest, role } = found;
	// viewer: who is reading, for the section's own queries, which must run
	// as them (never as the host) so their role's limits apply.
	const viewer: Person = { id: user.id, aal: user.aal };
	return { ...rest, role, viewer };
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
	async (slug: string, user: CurrentUser): Promise<ManagedEvent | null> => {
		const found = await queryEvent(slug, user);
		if (found) return found;
		const claimed = await asUser(user, (tx) => claimInvites(tx, user));
		return claimed > 0 ? queryEvent(slug, user) : null;
	},
);

/**
 * The event a dashboard section is about, for someone on its team whose role
 * opens that section. This is the gate: every section's page calls it.
 *
 * Signed out goes to sign-in and back, and whoever still has a code to enter
 * or an authenticator to set up goes there and back. Not on the team, or a section their
 * role does not open: "not found", the same answer as an address that does
 * not exist, so the dashboard never confirms that someone else's event is
 * there.
 */
export async function loadManagedEvent(
	slug: string,
	section: string,
): Promise<ManagedEvent & { twoStepHref: string | null }> {
	const here = `/dashboard/${encodeURIComponent(slug)}/${section}`;
	const user = await requireUser(here, "team");
	const event = await resolveEvent(slug, user);
	if (!event || !opensSection(event.role, section)) notFound();
	// Only the owner of a private draft gets here without the second step:
	// where they would bring someone in, they are sent to set it up.
	return { ...event, twoStepHref: twoStepFirst(user, here) };
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
