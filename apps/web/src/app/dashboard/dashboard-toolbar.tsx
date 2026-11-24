import { CreateEventButton } from "./create-event-dialog";
import { DashboardSearch } from "./dashboard-search";
import type { Workspace } from "./types";
import styles from "./toolbar.module.css";
import { ViewTabs } from "./view-tabs";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * The dashboard's own control row:
 *
 *   ( ● Workspace ⌄ ┊ Organized | Attending ┊ ⚙ )   [ search ]  [+ Create Event ]
 *
 * A server component, rendered once by the dashboard layout and kept mounted
 * across moves between the two lists. Its client parts read the open list and
 * the search from the URL, not from props, since a layout's props do not
 * change on those moves. The view links and the search work without script;
 * the workspace panel needs it to open. Create Event is a link to /events/new
 * that opens its popup instead once script has loaded.
 */
export function DashboardToolbar({
	workspaces,
	activeWorkspaceId,
}: {
	workspaces: readonly Workspace[];
	activeWorkspaceId: string;
}) {
	return (
		<div className={styles.toolbar}>
			<div className={styles.group}>
				<WorkspaceSwitcher
					workspaces={workspaces}
					activeId={activeWorkspaceId}
				/>

				<span className={styles.divider} aria-hidden="true" />

				<ViewTabs />

				<span className={styles.divider} aria-hidden="true" />

				{/* Workspace settings are not built yet: a button that says so,
				    not a link to a missing page. */}
				<button
					type="button"
					className={styles.iconButton}
					aria-disabled="true"
					title="Workspace settings are coming soon"
				>
					<span className={styles.srOnly}>Workspace settings, coming soon</span>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.75"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
					</svg>
				</button>
			</div>

			<DashboardSearch />

			<CreateEventButton
				workspaces={workspaces}
				activeWorkspaceId={activeWorkspaceId}
			/>
		</div>
	);
}
