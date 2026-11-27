import styles from "./design-editor.module.css";

/** The editor's shape while it loads: the pass on its mat, the side panel. */
export default function TicketDesignLoading() {
	return (
		<main aria-busy="true">
			<span className={styles.srOnly}>Loading the ticket design</span>
			<div className={styles.page} aria-hidden="true">
				<div className={styles.columns}>
					<span className={`${styles.bone} ${styles.boneStage}`} />
					<span className={`${styles.bone} ${styles.boneSide}`} />
				</div>
			</div>
		</main>
	);
}
