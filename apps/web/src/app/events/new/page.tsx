import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/identity";
import { CreateEventForm } from "../../dashboard/create-event-dialog";
import styles from "../../dashboard/create-event.module.css";
import { workspacesFor } from "../../dashboard/workspaces";

export const metadata: Metadata = {
	title: "Create an event",
	robots: { index: false, follow: false },
};

/**
 * The Create Event form on a page of its own, for anyone who goes to
 * /events/new directly. The dashboard's button opens the same form as a
 * popup; both post to the same action.
 */
export default async function NewEventPage() {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fevents%2Fnew");

	return (
		<main className={styles.page}>
			<div className={styles.pageCard}>
				<CreateEventForm
					workspaces={workspacesFor(user)}
					activeWorkspaceId="me"
					cancelHref="/dashboard"
				/>
			</div>
		</main>
	);
}
