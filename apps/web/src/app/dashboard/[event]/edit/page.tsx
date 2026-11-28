import { editableLink, isLinkKind, utcToZoned } from "@makemyevent/core";
import type { Metadata } from "next";
import { asUser } from "@/lib/db";
import { env } from "@/lib/env";
import { imageUrl } from "@/lib/storage";
import styles from "../event-shell.module.css";
import { loadManagedEvent } from "../load-event";
import { EventPageForm } from "./event-page-form";
import { VisibilityDialog } from "./visibility-dialog";

export const metadata: Metadata = {
	title: "Event Page",
	robots: { index: false, follow: false },
};

type Props = {
	params: Promise<{ event: string }>;
	searchParams: Promise<{ created?: string | string[] }>;
};

/**
 * Event Page: where a new event lands from the Create Event popup. The
 * poster and logo, the public address, how guests get in, the About text,
 * the schedule and the venue.
 */
export default async function EventEditPage({ params, searchParams }: Props) {
	const [{ event: slug }, query] = await Promise.all([params, searchParams]);
	const event = await loadManagedEvent(slug, "edit");
	// The About document only here: it can be long, and no other section
	// needs it, so it stays out of the shared event query.
	const more = await asUser(event.viewer, (tx) =>
		tx.event.findUniqueOrThrow({
			where: { id: event.id },
			select: {
				about: true,
				registrationOpensAt: true,
				registrationClosesAt: true,
				format: true,
				venueName: true,
				venueAddress: true,
				venueLat: true,
				venueLng: true,
				onlineUrl: true,
				links: {
					orderBy: { position: "asc" },
					select: { kind: true, url: true },
				},
			},
		}),
	);
	const { about } = more;
	// Dates go to the form as they read on the event's own clock.
	const zone = event.timeZone ?? "";
	const wall = (at: Date | null) =>
		at && zone ? utcToZoned(at, zone) : { date: "", time: "" };
	const start = wall(event.startsAt);
	const end = wall(event.endsAt);
	const opens = wall(more.registrationOpensAt);
	const closes = wall(more.registrationClosesAt);
	const local = (moment: { date: string; time: string }) =>
		moment.date ? `${moment.date}T${moment.time}` : "";

	const tickets = event.ticketTypes;
	const inviteOnlyCount = tickets.filter((type) => type.inviteOnly).length;

	return (
		<main>
			<h2 className={styles.srOnly}>Event Page</h2>
			<EventPageForm
				eventId={event.id}
				origin={new URL(env.appUrl).host}
				publicBase={`${env.appUrl}/event/`}
				published={event.status !== "draft"}
				media={{
					poster: event.posterPath
						? {
								large: imageUrl(`${event.posterPath}-1080.webp`),
								small: imageUrl(`${event.posterPath}-540.webp`),
							}
						: null,
					logo: event.logoPath ? imageUrl(`${event.logoPath}-256.webp`) : null,
				}}
				saved={{
					address: event.slug,
					posterAlt: event.posterAlt ?? "",
					about: about === null ? "" : JSON.stringify(about),
					inviteOnly: tickets.length > 0 && inviteOnlyCount === tickets.length,
					listed: event.listed,
					registrationClosed: event.registrationPausedAt !== null,
					capacity: event.capacity === null ? "" : String(event.capacity),
					timeZone: zone,
					startDate: start.date,
					startTime: start.time,
					endDate: end.date,
					endTime: end.time,
					opensAt: local(opens),
					closesAt: local(closes),
					format: more.format,
					venueAddress: more.venueAddress ?? "",
					venueName: more.venueName ?? "",
					lat: more.venueLat,
					lng: more.venueLng,
					onlineUrl: more.onlineUrl ?? "",
					// As the host would type them: handles, not addresses.
					links: more.links.flatMap((link, i) =>
						isLinkKind(link.kind)
							? [
									{
										id: `s${i}`,
										kind: link.kind,
										value: editableLink(link.kind, link.url),
									},
								]
							: [],
					),
				}}
				someInviteOnly={inviteOnlyCount > 0 && inviteOnlyCount < tickets.length}
				ticketCount={tickets.length}
			/>
			{/* Straight after Create Event, once: who should find it. A draft
			    only: once published, Public listing on this page says it. */}
			{query.created === "1" && event.status === "draft" ? (
				<VisibilityDialog
					eventId={event.id}
					listed={event.listed}
					origin={new URL(env.appUrl).host}
					address={event.slug}
				/>
			) : null}
		</main>
	);
}
