import { readForm, utcToZoned } from "@makemyevent/core";
import type { Metadata } from "next";
import { asUser } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { masterKey } from "@/lib/pass-token";
import shell from "../event-shell.module.css";
import { loadManagedEvent } from "../load-event";
import { doorCount } from "./actions";
import { Scanner } from "./scanner";

export const metadata: Metadata = {
	title: "Scan QR",
	robots: { index: false, follow: false },
};

/** A walk-in can be emailed their pass: the actions may take a moment. */
export const maxDuration = 30;

type Props = { params: Promise<{ event: string }> };

/**
 * The door: the camera reads passes one after another, the server checks
 * each, and a banner and a sound say let in, already in, or stop. Below
 * it, the guest list to find and let in someone by hand. For everyone on
 * the team; walk-ins only for those who manage the event.
 */
export default async function ScanPage({ params }: Props) {
	const { event: slug } = await params;
	const event = await loadManagedEvent(slug, "scan-qr");
	const canManage = event.role !== "volunteer";

	const data = await asUser(event.viewer, async (tx) => {
		const [days, fields, doorState, doors, members] = await Promise.all([
			tx.eventDay.findMany({
				where: { eventId: event.id },
				select: { day: true },
				orderBy: { day: "asc" },
			}),
			canManage
				? tx.formField.findMany({
						where: { eventId: event.id, archivedAt: null },
						orderBy: { position: "asc" },
						select: {
							id: true,
							kind: true,
							core: true,
							label: true,
							placeholder: true,
							help: true,
							required: true,
							settings: true,
							showIf: true,
						},
					})
				: [],
			tx.event.findUniqueOrThrow({
				where: { id: event.id },
				select: { doorsEnabled: true },
			}),
			tx.eventDoor.findMany({
				where: { eventId: event.id, retiredAt: null },
				orderBy: [{ position: "asc" }, { createdAt: "asc" }],
				select: { id: true, name: true },
			}),
			// Volunteers and their doors: the viewer's own, and (for those who
			// manage the event) everyone's, to assign.
			tx.eventMember.findMany({
				where: {
					eventId: event.id,
					role: "volunteer",
					...(canManage ? {} : { userId: event.viewer.id }),
				},
				orderBy: [{ displayName: "asc" }, { id: "asc" }],
				select: {
					id: true,
					userId: true,
					displayName: true,
					door: { select: { doorId: true } },
				},
			}),
		]);
		return {
			days,
			fields,
			doorsEnabled: doorState.doorsEnabled,
			doors,
			members,
		};
	});
	const mine = data.members.find((m) => m.userId === event.viewer.id);
	const assignedId = data.doorsEnabled ? (mine?.door?.doorId ?? null) : null;
	const assigned = data.doors.find((d) => d.id === assignedId) ?? null;

	const today = utcToZoned(new Date(), event.timeZone ?? "UTC").date;
	const index = data.days.findIndex(
		(d) => d.day.toISOString().slice(0, 10) === today,
	);
	const dayLabel =
		data.days.length > 1 && index >= 0
			? `Day ${index + 1} of ${data.days.length}`
			: null;
	// A walk-in answers what everyone must: name, email, and the questions
	// marked required. Optional ones are left for later.
	const read = readForm(data.fields);
	const walkInFields = read.ok
		? read.fields.filter((f) => f.core !== null || f.required)
		: [];

	return (
		<main>
			<h2 className={shell.srOnly}>Scan QR</h2>
			<Scanner
				eventId={event.id}
				dayLabel={dayLabel}
				initialCount={await doorCount(event.id)}
				doors={{
					enabled: data.doorsEnabled,
					list: data.doors,
					assigned,
				}}
				doorSetup={
					canManage
						? {
								volunteers: data.members.map((m) => ({
									memberId: m.id,
									name: m.displayName,
									doorId: m.door?.doorId ?? null,
								})),
							}
						: null
				}
				walkIn={
					canManage
						? {
								fields: walkInFields,
								tickets: event.ticketTypes.map((t) => ({
									id: t.id,
									name: t.name,
								})),
								emailReady: emailConfigured() && masterKey() !== null,
							}
						: null
				}
			/>
		</main>
	);
}
