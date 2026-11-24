import { getCurrentUser } from "@/lib/supabase/identity";
import { DashboardToolbar } from "../dashboard-toolbar";
import { PendingSlot } from "../pending-nav";
import type { Workspace } from "../types";
import { workspacesFor } from "../workspaces";

/**
 * The event lists, Organized and Attending: the toolbar, then whichever list
 * is open. A route group, so the URLs stay /dashboard and
 * /dashboard/attending while one event's pages, beside them, get a sidebar
 * instead of this toolbar.
 *
 * The toolbar lives here rather than in each page so that it stays mounted
 * while someone moves between Organized and Attending — the view marker
 * slides on the same element instead of being drawn afresh — and so that
 * moving between them fetches only the list.
 */
export default async function ListsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// For the workspace name only. Each page gates itself, since this layout
	// is not rendered again on a move between them; cache() makes the second
	// call free on the first load.
	const user = await getCurrentUser();

	const workspaces: readonly Workspace[] = user ? workspacesFor(user) : [];

	return (
		<>
			{user ? (
				<DashboardToolbar workspaces={workspaces} activeWorkspaceId="me" />
			) : null}
			<PendingSlot level="lists">{children}</PendingSlot>
		</>
	);
}
