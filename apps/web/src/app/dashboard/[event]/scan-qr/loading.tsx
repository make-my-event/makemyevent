import styles from "./scanner.module.css";

/** The scanner's shape while it loads: the bar, the camera, the tools. */
export default function ScanLoading() {
	return (
		<main aria-busy="true">
			<span className={styles.srOnly}>Loading the scanner</span>
			<div className={styles.scanner} aria-hidden="true">
				<div className={styles.top}>
					<span className={`${styles.bone} ${styles.boneLine}`} />
				</div>
				<div className={styles.stage} />
				<div className={styles.tools}>
					<span className={`${styles.bone} ${styles.boneTool}`} />
					<span className={`${styles.bone} ${styles.boneTool}`} />
					<span className={`${styles.bone} ${styles.boneTool}`} />
				</div>
			</div>
		</main>
	);
}
