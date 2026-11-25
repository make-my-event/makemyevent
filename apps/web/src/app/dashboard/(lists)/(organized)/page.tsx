import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { MemberRole } from "@makemyevent/core";
import { asUser } from "@/lib/db";
import { env } from "@/lib/env";
import { imageUrl } from "@/lib/storage";
import { getCurrentUser } from "@/lib/supabase/identity";
import styles from "../../dashboard.module.css";
import { claimInvites } from "../../claim-invites";
import { CreateEventButton } from "../../create-event-dialog";
import { emptyActionClass } from "../../empty-state";
import { OrganizedList } from "../../organized-list";
import {
	type OrganizedEvent,
	organizedHref,
	parsePhase,
	parseQuery,
} from "../../types";
import { workspacesFor } from "../../workspaces";

export const metadata: Metadata = {
	title: "Organized",
	robots: { index: false, follow: false },
};

type Props = {
	searchParams: Promise<{
		q?: string | string[];
		status?: string | string[];
	}>;
};

/** The events the active workspace runs. */
export default async function OrganizedPage({ searchParams }: Props) {
	// Gated here, not only in the layout: a layout is not rendered again when
	// someone moves between its pages, so it cannot be what keeps them out.
	const user = await getCurrentUser();
	if (!user)
		redirect(`/signin?next=${encodeURIComponent(organizedHref("", null))}`);

	const params = await searchParams;
	const query = parseQuery(params.q);
	const phase = parsePhase(params.status);

	return (
		<main className={styles.main}>
			<h1 className={styles.srOnly}>Events you organize</h1>
			<OrganizedList
				events={await workspaceEvents(user)}
				query={query}
				phase={phase}
				now={new Date()}
				createAction={
					<CreateEventButton
						workspaces={workspacesFor(user)}
						activeWorkspaceId="me"
						label="Create your first event"
						className={emptyActionClass}
						icon={false}
					/>
				}
			/>
		</main>
	);
}

/**
 * The events this person hosts or is on the team of, drafts included: the
 * personal workspace is the only one so far. Read under their row-level security, found through
 * the (host_user_id, starts_at) index; newest first, which is the order
 * events without a date keep in the list.
 *
 * Registrations are the counts each ticket keeps, summed; never a COUNT(*).
 */
async function workspaceEvents(
	user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
): Promise<readonly OrganizedEvent[]> {
	const userId = user.id;
	const events = await asUser(userId, async (tx) => {
		// Invitations sent to their email become memberships here, so an event
		// they were added to is in their list on their next visit.
		await claimInvites(tx, user);
		return tx.event.findMany({
			where: {
				OR: [{ hostUserId: userId }, { members: { some: { userId } } }],
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			select: {
				id: true,
				slug: true,
				title: true,
				venueName: true,
				startsAt: true,
				endsAt: true,
				timeZone: true,
				posterPath: true,
				status: true,
				hostUserId: true,
				ticketTypes: { select: { registeredCount: true } },
				members: { where: { userId }, select: { role: true }, take: 1 },
			},
		});
	});

	return events.map((event) => ({
		id: event.id,
		slug: event.slug,
		code: null,
		title: event.title,
		venue: event.venueName,
		startsAt: event.startsAt?.toISOString() ?? null,
		endsAt: event.endsAt?.toISOString() ?? null,
		timeZone: event.timeZone,
		published: event.status === "published",
		registrations: Number(
			event.ticketTypes.reduce((sum, type) => sum + type.registeredCount, 0n),
		),
		role:
			event.hostUserId === userId
				? "owner"
				: ((event.members[0]?.role as MemberRole | undefined) ?? "volunteer"),
		coverUrl: event.posterPath
			? imageUrl(`${event.posterPath}-540.webp`)
			: null,
		publicUrl: `${env.appUrl}/event/${encodeURIComponent(event.slug)}`,
	}));
}
