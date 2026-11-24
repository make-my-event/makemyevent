import dashboard from "../../dashboard.module.css";
import styles from "../../events.module.css";

/**
 * Under the toolbar while the Organized list loads: the filter row, then
 * cards at the cards' own height, so nothing moves when they arrive.
 */
export default function OrganizedLoading() {
	return (
		<main className={`${dashboard.main} ${styles.list}`} aria-busy="true">
			<span className={styles.srOnly}>Loading your events</span>
			<div className={styles.skeletonFilters} />
			<div className={styles.skeletonGrid}>
				<div className={styles.skeletonCard} />
				<div className={styles.skeletonCard} />
				<div className={styles.skeletonCard} />
			</div>
		</main>
	);
}
