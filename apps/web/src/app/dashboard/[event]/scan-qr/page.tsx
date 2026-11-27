import { utcToZoned } from "@makemyevent/core";
import type { Metadata } from "next";
import { asUser } from "@/lib/db";
import shell from "../event-shell.module.css";
import { loadManagedEvent } from "../load-event";
import { doorCount } from "./actions";
import { Scanner } from "./scanner";

export const metadata: Metadata = {
	title: "Scan QR",
	robots: { index: false, follow: false },
};

type Props = { params: Promise<{ event: string }> };

/**
 * The door: the camera reads passes one after another, the server checks
 * each, and the screen and a sound say let in, already in, or stop. For
 * everyone on the team, volunteers included.
 */
export default async function ScanPage({ params }: Props) {
	const { event: slug } = await params;
	const event = await loadManagedEvent(slug, "scan-qr");

	const days = await asUser(event.viewer, (tx) =>
		tx.eventDay.findMany({
			where: { eventId: event.id },
			select: { day: true },
			orderBy: { day: "asc" },
		}),
	);
	const today = utcToZoned(new Date(), event.timeZone ?? "UTC").date;
	const index = days.findIndex(
		(d) => d.day.toISOString().slice(0, 10) === today,
	);
	const dayLabel =
		days.length > 1 && index >= 0 ? `Day ${index + 1} of ${days.length}` : null;
	const count = await doorCount(event.id);

	return (
		<main>
			<h2 className={shell.srOnly}>Scan QR</h2>
			<Scanner
				eventId={event.id}
				eventTitle={event.title}
				dayLabel={dayLabel}
				initialCount={count}
			/>
		</main>
	);
}
