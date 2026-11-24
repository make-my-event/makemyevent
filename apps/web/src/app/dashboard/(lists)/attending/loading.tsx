import styles from "../../dashboard.module.css";

/**
 * Under the toolbar while the Attending list loads; the toolbar itself is in
 * the layout and stays put. Rows are sized to the rows they stand in for.
 *
 * Each list has its own, and the layout none: a skeleton one level up would
 * show first on every move, then give way to the page's own.
 */
export default function AttendingLoading() {
	return (
		<main className={styles.main} aria-busy="true">
			<span className={styles.srOnly}>Loading your events</span>
			<div className={styles.skeletonRow} />
			<div className={styles.skeletonRow} />
			<div className={styles.skeletonRow} />
		</main>
	);
}
