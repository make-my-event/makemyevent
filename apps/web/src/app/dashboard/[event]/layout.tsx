import { cookies } from "next/headers";
import { PendingSlot } from "../pending-nav";
import { Suspense } from "react";
import { EventHeader, EventHeaderSkeleton } from "./event-header";
import { EventSidebar } from "./event-sidebar";
import { findManagedEvent } from "./load-event";
import styles from "./event-shell.module.css";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";
import { UnsavedChangesGuard } from "./unsaved-changes";

/**
 * One event's dashboard, at /dashboard/{event}/{section}: the sidebar beside
 * whichever section is open. The site band comes from the dashboard layout
 * above this one.
 *
 * The event header (name, date, state) and the sidebar live here, so they
 * stay mounted, and keep their state, while someone moves between sections. So does the unsaved-changes guard, which
 * asks to save or discard before leaving a section with edits in it.
 *
 * Each section's page gates itself and loads the event; a layout is not
 * rendered again on a move between its pages, so it cannot be what keeps
 * people out.
 */
export default async function EventLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ event: string }>;
}) {
	const [{ event }, store] = await Promise.all([params, cookies()]);
	// Open unless the person closed it; only wide screens use this.
	const expanded = store.get(SIDEBAR_COOKIE)?.value !== "collapsed";

	return (
		<UnsavedChangesGuard>
			<div className={styles.shell}>
				{/* Its own boundary, so the sidebar and the section's skeleton
				    show without waiting for the event. */}
				<div className={styles.eventHeader}>
					<Suspense fallback={<EventHeaderSkeleton />}>
						<EventHeader slug={event} />
					</Suspense>
				</div>
				{/* Every section at once; then, with the role known, only those it
				    opens. Only a volunteer sees the list change. */}
				<Suspense
					fallback={
						<EventSidebar eventSlug={event} defaultExpanded={expanded} />
					}
				>
					<RoleSidebar slug={event} expanded={expanded} />
				</Suspense>
				<div className={styles.content}>
					<PendingSlot level="section">{children}</PendingSlot>
				</div>
			</div>
		</UnsavedChangesGuard>
	);
}

/** The sidebar for the reader's role, once the event (cached for this request) is in. */
async function RoleSidebar({
	slug,
	expanded,
}: {
	slug: string;
	expanded: boolean;
}) {
	const event = await findManagedEvent(slug);
	return (
		<EventSidebar
			eventSlug={slug}
			defaultExpanded={expanded}
			role={event?.role}
		/>
	);
}
