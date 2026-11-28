import type { Metadata } from "next";
import { EVENT_TITLE_MAX } from "@makemyevent/core";
import { requireUser } from "@/lib/require-user";
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
export default async function NewEventPage({
	searchParams,
}: {
	searchParams: Promise<{ title?: string | string[] }>;
}) {
	// Carried over from the popup, by someone who stopped to enter their
	// two-step code on the way.
	const { title } = await searchParams;
	const typed =
		typeof title === "string" ? title.slice(0, EVENT_TITLE_MAX) : "";
	const user = await requireUser(
		typed
			? `/events/new?${new URLSearchParams({ title: typed })}`
			: "/events/new",
		"self",
	);

	return (
		<main className={styles.page}>
			<div className={styles.pageCard}>
				<CreateEventForm
					workspaces={workspacesFor(user)}
					activeWorkspaceId="me"
					cancelHref="/dashboard"
					defaultTitle={typed}
				/>
			</div>
		</main>
	);
}
