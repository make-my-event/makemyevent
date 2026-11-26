import ui from "@/components/ui/ui.module.css";
import styles from "@/app/signin/two-step.module.css";

/** The page's three sections, at the size they come in at. */
export default function SecurityLoading() {
	return (
		<main className={styles.page} aria-busy="true">
			<h1 className={styles.h1}>Account security</h1>
			<p className={ui.srOnly}>Loading…</p>
			<div className={styles.notice} />
			{["two-step", "codes", "devices"].map((section) => (
				<div className={styles.section} key={section} aria-hidden="true">
					<span className={`${ui.bone} ${styles.boneTitle}`} />
					<span className={`${ui.bone} ${styles.boneText}`} />
					<span className={`${ui.bone} ${styles.boneButton}`} />
				</div>
			))}
		</main>
	);
}
