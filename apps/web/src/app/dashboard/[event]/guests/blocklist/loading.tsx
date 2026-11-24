import shell from "../../event-shell.module.css";
import styles from "./blocklist.module.css";

/** The blocklist while it loads: its heading and two empty columns. */
export default function BlocklistLoading() {
	return (
		<main aria-busy="true">
			<p className={shell.srOnly} role="status">
				Loading the blocklist
			</p>
			<div className={styles.page} aria-hidden="true">
				<header className={styles.head}>
					<span className={styles.back}>Guests</span>
					<h3 className={styles.title}>Blocklist</h3>
					<p className={styles.lead}>
						Emails and phone numbers that can't register for this event. Changes
						save as you make them.
					</p>
				</header>
				<div className={styles.columns}>
					{["Emails", "Phone numbers"].map((title) => (
						<section key={title} className={styles.column}>
							<header className={styles.columnHead}>
								<span className={styles.columnIcon} />
								<h4 className={styles.columnTitle}>{title}</h4>
							</header>
							<div className={`${styles.add} ${styles.addSkeleton}`} />
						</section>
					))}
				</div>
			</div>
		</main>
	);
}
