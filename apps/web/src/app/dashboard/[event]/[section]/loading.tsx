import styles from "../../dashboard.module.css";
import shell from "../event-shell.module.css";

/**
 * A section not built yet, while its placeholder loads: the same dashed
 * frame and wording, the section's name and the button as bones at their
 * size, so the placeholder lands without moving anything.
 */
export default function UnbuiltSectionLoading() {
	return (
		<main aria-busy="true">
			<p className={shell.srOnly} role="status">
				Loading
			</p>
			<div className={styles.empty} aria-hidden="true">
				<span className={`${styles.bone} ${styles.boneEmptyTitle}`} />
				<p className={styles.emptyBody}>
					It comes in a later step. The Overview has your event, its
					registrations and its team in the meantime.
				</p>
				<span className={`${styles.emptyAction} ${styles.boneControl}`}>
					Go to Overview
				</span>
			</div>
		</main>
	);
}
