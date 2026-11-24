import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/identity";
import styles from "../../dashboard.module.css";
import { EmptyState } from "../../empty-state";
import { parseQuery, viewHref } from "../../types";

export const metadata: Metadata = {
	title: "Attending",
	robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

/** The events the signed-in person holds tickets for, whatever workspace is chosen. */
export default async function AttendingPage({ searchParams }: Props) {
	// Gated here, not only in the layout: a layout is not rendered again when
	// someone moves between its pages, so it cannot be what keeps them out.
	const user = await getCurrentUser();
	if (!user)
		redirect(`/signin?next=${encodeURIComponent("/dashboard/attending")}`);

	const query = parseQuery((await searchParams).q);

	return (
		<main className={styles.main}>
			<h1 className={styles.srOnly}>Events you are attending</h1>
			{query ? (
				<EmptyState
					title={`Nothing matched “${query}”`}
					body="Search looks at the names of events you hold tickets for, and at your ticket codes."
					action={{ label: "Clear search", href: viewHref("attending", "") }}
				/>
			) : (
				<EmptyState
					title="No tickets yet"
					body="Events you register for show up here, with your pass ready to scan at the door."
					action={{ label: "Find an event", href: "/" }}
				/>
			)}
		</main>
	);
}
