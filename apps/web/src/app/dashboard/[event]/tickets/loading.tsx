import styles from "./tickets.module.css";

/** The section's shape while it loads: the strip, the list, the editor. */
export default function TicketsLoading() {
	return (
		<main aria-busy="true">
			<span className={styles.srOnly}>Loading tickets</span>
			<div className={styles.page} aria-hidden="true">
				<span className={`${styles.bone} ${styles.boneStrip}`} />
				<div className={styles.columns}>
					<span className={`${styles.bone} ${styles.boneList}`} />
					<span className={`${styles.bone} ${styles.boneEditor}`} />
				</div>
			</div>
		</main>
	);
}
