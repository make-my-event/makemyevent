import { recordId, SAMPLE_GUEST } from "@makemyevent/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { designOf, eventPassValues, passQuestions } from "@/lib/pass";
import shell from "../../../event-shell.module.css";
import { loadManagedEvent } from "../../../load-event";
import { DesignEditor } from "./design-editor";

export const metadata: Metadata = {
	title: "Ticket design",
	robots: { index: false, follow: false },
};

type Props = { params: Promise<{ event: string; ticket: string }> };

/**
 * One ticket's pass design: the artwork, its accent, and where the code and
 * each line of text sit. Shown with the event's own details and a sample
 * guest; a real pass gets the guest's.
 */
export default async function TicketDesignPage({ params }: Props) {
	const { event: slug, ticket: ticketId } = await params;
	if (!recordId.safeParse(ticketId).success) notFound();
	const event = await loadManagedEvent(slug, "tickets");

	const data = await asUser(event.viewer, async (tx) => {
		const ticket = await tx.ticketType.findFirst({
			where: { id: ticketId, eventId: event.id },
			select: {
				id: true,
				name: true,
				designs: { select: { base: true, accent: true, layers: true } },
			},
		});
		if (!ticket) return null;
		const [place, questions, tickets] = await Promise.all([
			tx.event.findUniqueOrThrow({
				where: { id: event.id },
				select: { format: true, venueName: true, venueAddress: true },
			}),
			passQuestions(tx, event.id),
			tx.ticketType.count({ where: { eventId: event.id } }),
		]);
		return { ticket, place, questions, tickets };
	});
	if (!data) notFound();

	const values = {
		...eventPassValues({ ...event, ...data.place }),
		ticket_name: data.ticket.name,
		...SAMPLE_GUEST,
		answers: Object.fromEntries(
			data.questions.map((q) => [q.id, `${q.label} answer`]),
		),
	};

	return (
		<main>
			<h2 className={shell.srOnly}>Ticket design</h2>
			<DesignEditor
				eventId={event.id}
				ticketId={data.ticket.id}
				ticketName={data.ticket.name}
				ticketCount={data.tickets}
				backHref={`/dashboard/${encodeURIComponent(event.slug)}/tickets`}
				saved={designOf(data.ticket.designs[0])}
				values={values}
				questions={data.questions.map((q) => ({ id: q.id, label: q.label }))}
			/>
		</main>
	);
}
