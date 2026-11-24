import styles from "./toolbar.module.css";

/**
 * The toolbar's outline, for a move into the lists from an event: the
 * workspace group, the search and Create Event, at their own sizes and
 * places, so the toolbar lands without moving anything.
 */
export function ToolbarSkeleton() {
	return (
		<div className={styles.toolbar} aria-hidden="true">
			<span className={`${styles.group} ${styles.skeletonGroup}`} />
			<span className={`${styles.search} ${styles.skeletonSearch}`} />
			<span className={`${styles.create} ${styles.skeletonCreate}`} />
		</div>
	);
}
