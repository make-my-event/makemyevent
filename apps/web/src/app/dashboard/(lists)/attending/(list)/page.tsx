import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/identity";
import { claimTickets } from "../../../claim-invites";
import styles from "../../../dashboard.module.css";
import { EmptyState } from "../../../empty-state";
import events from "../../../events.module.css";
import { myTickets } from "../../../my-tickets";
import { TicketCard } from "../../../ticket-card";
import { listTickets } from "../../../ticket-state";
import { parseQuery, viewHref } from "../../../types";

export const metadata: Metadata = {
	title: "Attending",
	robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

/**
 * The events the signed-in person holds tickets for, whatever workspace is
 * chosen. A ticket sent to their email before they had an account becomes
 * theirs here.
 */
export default async function AttendingPage({ searchParams }: Props) {
	// Gated here, not only in the layout: a layout is not rendered again when
	// someone moves between its pages, so it cannot be what keeps them out.
	const user = await getCurrentUser();
	if (!user)
		redirect(`/signin?next=${encodeURIComponent("/dashboard/attending")}`);

	const query = parseQuery((await searchParams).q);
	const tickets = await asUser(user.id, async (tx) => {
		await claimTickets(tx, user);
		return myTickets(tx);
	});
	const now = new Date();
	const shown = listTickets(tickets, query, now);

	return (
		<main className={styles.main}>
			<h1 className={styles.srOnly}>Events you are attending</h1>
			{shown.length > 0 ? (
				<div className={events.list}>
					<ul className={events.grid}>
						{shown.map((ticket) => (
							<li key={ticket.id}>
								<TicketCard ticket={ticket} now={now} />
							</li>
						))}
					</ul>
				</div>
			) : tickets.length > 0 ? (
				<EmptyState
					title={`Nothing matched “${query}”`}
					body="Search looks at the names and venues of events you hold tickets for, and at your ticket codes."
					action={{ label: "Clear search", href: viewHref("attending", "") }}
				/>
			) : (
				<EmptyState
					title="No tickets yet"
					body={`Tickets sent to ${user.email ?? "your email"} show up here, with your pass ready to scan at the door. Invited at another address? Sign in with that one.`}
					action={{ label: "Find an event", href: "/" }}
				/>
			)}
		</main>
	);
}
