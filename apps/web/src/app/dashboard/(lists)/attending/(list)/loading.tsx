import styles from "../../../dashboard.module.css";
import events from "../../../events.module.css";

/**
 * Under the toolbar while the Attending list loads; the toolbar itself is in
 * the layout and stays put. Cards at the cards' own height, so nothing moves
 * when they arrive.
 *
 * Each list has its own, and the layout none: a skeleton one level up would
 * show first on every move, then give way to the page's own.
 */
export default function AttendingLoading() {
	return (
		<main className={`${styles.main} ${events.list}`} aria-busy="true">
			<span className={styles.srOnly}>Loading your tickets</span>
			<div className={events.skeletonGrid}>
				<div className={events.skeletonCard} />
				<div className={events.skeletonCard} />
				<div className={events.skeletonCard} />
			</div>
		</main>
	);
}
