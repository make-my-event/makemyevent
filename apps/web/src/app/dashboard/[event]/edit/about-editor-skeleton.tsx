import styles from "./about-editor.module.css";

/**
 * The editor's frame while its code loads: header, toolbar, a few lines, and
 * the status line beneath, which the editor always keeps.
 */
export function AboutEditorSkeleton() {
	return (
		<section className={styles.section} aria-busy="true">
			<header className={styles.head}>
				<h3 className={styles.title}>About</h3>
			</header>
			<div className={styles.frame}>
				<div className={styles.toolbar} aria-hidden="true">
					<span className={styles.boneTools} />
				</div>
				<div className={styles.boneBody} aria-hidden="true">
					<span className={styles.boneLine} />
					<span className={styles.boneLine} />
					<span className={`${styles.boneLine} ${styles.boneShort}`} />
				</div>
			</div>
			<p className={styles.status} />
		</section>
	);
}
