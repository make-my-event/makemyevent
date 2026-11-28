import styles from "./scanner.module.css";

/** The door's shape while it loads: the bar, the scanner, the guest list. */
export default function ScanLoading() {
	return (
		<main aria-busy="true">
			<span className={styles.srOnly}>Loading the scanner</span>
			<div className={styles.door} aria-hidden="true">
				<span className={`${styles.bone} ${styles.boneBar}`} />
				<span className={`${styles.bone} ${styles.bonePanel}`} />
				<span className={`${styles.bone} ${styles.boneList}`} />
			</div>
		</main>
	);
}
