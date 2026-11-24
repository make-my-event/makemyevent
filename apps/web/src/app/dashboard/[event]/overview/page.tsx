import { type MemberRole, managesTeam } from "@makemyevent/core";
import type { Metadata } from "next";
import { asUser } from "@/lib/db";
import { env } from "@/lib/env";
import styles from "../event-shell.module.css";
import { choiceSplit } from "../choice-split";
import { glanceFor, registeredTotal } from "../glance-for";
import { loadManagedEvent } from "../load-event";
import { GlanceCard } from "./glance";
import {
	RECENT_LIMIT,
	type RecentRegistration,
	RecentRegistrationsCard,
} from "./recent-registrations";
import { ShareCard } from "./share-card";
import { TeamCard, type TeamMember } from "./team-card";

export const metadata: Metadata = {
	title: "Overview",
	robots: { index: false, follow: false },
};

type Props = { params: Promise<{ event: string }> };

/** An event's Overview: the first section in its sidebar. */
export default async function EventOverviewPage({ params }: Props) {
	const { event: slug } = await params;
	// Checks sign-in and that the event is theirs, in one query, shared with
	// the event header.
	const event = await loadManagedEvent(slug, "overview");

	// The newest confirmed registrations, read through the host's row-level
	// security on the (event_id, created_at DESC, id DESC) index: an index
	// scan that stops at RECENT_LIMIT rows, however many there are.
	//
	// The team in the same transaction: the owner (the host's own row, which
	// row-level security lets a teammate read) and every member, oldest first.
	const { recent, team, split } = await asUser(event.viewerId, async (tx) => {
		const recent = await tx.registration.findMany({
			where: { eventId: event.id, status: "confirmed" },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: RECENT_LIMIT,
			select: {
				id: true,
				attendeeName: true,
				attendeeEmail: true,
				ticketTypeId: true,
				createdAt: true,
			},
		});
		const team = await tx.event.findUniqueOrThrow({
			where: { id: event.id },
			select: {
				host: { select: { displayName: true, email: true } },
				members: {
					orderBy: [{ createdAt: "asc" }, { id: "asc" }],
					select: {
						id: true,
						displayName: true,
						email: true,
						role: true,
						userId: true,
					},
				},
			},
		});
		// One ticket: the Summary splits by the form's choice question.
		const split =
			event.ticketTypes.length === 1
				? await choiceSplit(tx, event.id, registeredTotal(event))
				: null;
		return { recent, team, split };
	});
	const members: TeamMember[] = [
		{
			id: null,
			name: team.host.displayName,
			email: team.host.email,
			role: "owner",
			joined: true,
			you: event.role === "owner",
		},
		...team.members.map((member) => ({
			id: member.id,
			name: member.displayName,
			email: member.email,
			role: member.role as MemberRole,
			joined: member.userId !== null,
			you: member.userId === event.viewerId,
		})),
	];

	const now = new Date();
	const published = event.status === "published";
	const glance = glanceFor(event, recent[0]?.createdAt ?? null, now, split);

	const typeById = new Map(glance.types.map((type) => [type.id, type]));
	const rows: RecentRegistration[] = recent.map((registration) => {
		const type = typeById.get(registration.ticketTypeId);
		return {
			id: registration.id,
			name: registration.attendeeName,
			email: registration.attendeeEmail,
			ticketName: type?.name ?? "Ticket",
			tone: type?.tone ?? "rest",
			at: registration.createdAt,
		};
	});

	return (
		<main>
			<h2 className={styles.srOnly}>Overview</h2>
			<GlanceCard
				glance={glance}
				timeZone={event.timeZone}
				limitHref={
					event.role === "volunteer"
						? undefined
						: `/dashboard/${encodeURIComponent(event.slug)}/edit#capacity`
				}
			/>
			<ShareCard
				url={`${env.appUrl}/event/${encodeURIComponent(event.slug)}`}
				title={event.title}
				published={published}
			/>
			<RecentRegistrationsCard
				rows={rows}
				total={glance.registered}
				guestsHref={`/dashboard/${encodeURIComponent(event.slug)}/guests`}
				timeZone={event.timeZone}
				now={now}
			/>
			<TeamCard
				eventId={event.id}
				slug={event.slug}
				members={members}
				canManage={managesTeam(event.role)}
			/>
		</main>
	);
}
