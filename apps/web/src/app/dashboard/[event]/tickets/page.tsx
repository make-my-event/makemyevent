import { SAMPLE_GUEST, utcToZoned } from "@makemyevent/core";
import type { Metadata } from "next";
import { asUser } from "@/lib/db";
import { designOf, eventPassValues } from "@/lib/pass";
import styles from "../event-shell.module.css";
import { loadManagedEvent } from "../load-event";
import { type TicketRow, TicketsView } from "./tickets-view";

export const metadata: Metadata = {
	title: "Tickets",
	robots: { index: false, follow: false },
};

type Props = { params: Promise<{ event: string }> };

const ISO_DAY = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Tickets: how many places there are and how they are used, then each
 * ticket and its rules. Every count is a read of a kept number or one
 * indexed count, never a scan of the guest list.
 */
export default async function TicketsPage({ params }: Props) {
	const { event: slug } = await params;
	const event = await loadManagedEvent(slug, "tickets");

	const data = await asUser(event.viewer, async (tx) => {
		const full = await tx.event.findUniqueOrThrow({
			where: { id: event.id },
			select: {
				capacity: true,
				format: true,
				venueName: true,
				venueAddress: true,
				days: { select: { id: true, day: true }, orderBy: { day: "asc" } },
				ticketTypes: {
					orderBy: [{ position: "asc" }, { createdAt: "asc" }],
					select: {
						id: true,
						name: true,
						description: true,
						capacity: true,
						maxPerPerson: true,
						inviteOnly: true,
						waitlistEnabled: true,
						closedAt: true,
						multiDay: true,
						transferable: true,
						registeredCount: true,
						days: { select: { eventDay: { select: { day: true } } } },
						designs: { select: { base: true, accent: true, layers: true } },
					},
				},
			},
		});
		// Today's door: on a day of a multi-day event, that day's; otherwise
		// everyone let in.
		const today = utcToZoned(new Date(), event.timeZone ?? "UTC").date;
		const day = full.days.find((d) => ISO_DAY(d.day) === today);
		const [checkedIn, waiting] = await Promise.all([
			tx.checkIn.count({
				where: { eventId: event.id, ...(day ? { eventDayId: day.id } : {}) },
			}),
			tx.registration.groupBy({
				by: ["ticketTypeId"],
				where: { eventId: event.id, status: "waitlisted" },
				_count: { _all: true },
			}),
		]);
		return { full, checkedIn, today: Boolean(day), waiting };
	});

	const waiting = new Map(
		data.waiting.map((row) => [row.ticketTypeId, row._count._all]),
	);
	const tickets: TicketRow[] = data.full.ticketTypes.map((t) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		capacity: t.capacity === null ? null : Number(t.capacity),
		maxPerPerson: t.maxPerPerson,
		inviteOnly: t.inviteOnly,
		waitlist: t.waitlistEnabled,
		closed: t.closedAt !== null,
		multiDay: t.multiDay,
		transferable: t.transferable,
		registered: Number(t.registeredCount),
		waiting: waiting.get(t.id) ?? 0,
		days: t.days.map((d) => ISO_DAY(d.eventDay.day)).sort(),
		design: designOf(t.designs[0]),
	}));

	return (
		<main>
			<h2 className={styles.srOnly}>Tickets</h2>
			<TicketsView
				eventId={event.id}
				eventCapacity={
					data.full.capacity === null ? null : Number(data.full.capacity)
				}
				eventDays={data.full.days.map((d) => ISO_DAY(d.day))}
				checkedIn={data.checkedIn}
				checkedInToday={data.today}
				capacityHref={`/dashboard/${encodeURIComponent(event.slug)}/edit#capacity`}
				pass={{
					values: {
						...eventPassValues({ ...event, ...data.full }),
						...SAMPLE_GUEST,
					},
					designHref: `/dashboard/${encodeURIComponent(event.slug)}/tickets`,
				}}
				tickets={tickets}
			/>
		</main>
	);
}
