import shell from "../event-shell.module.css";
import styles from "./form-builder.module.css";

/**
 * The Form Builder while it loads, in its own frames: the heading, the
 * sheet with a new event's four questions as bones at a row's height, the
 * Add button, and the preview's card beside it on a wide screen.
 */
/** A new event's questions, by kind, so each tag is its real width. */
const STARTING = ["Short text", "Email", "Phone", "Dropdown"];

export default function FormBuilderLoading() {
	return (
		<main aria-busy="true">
			<p className={shell.srOnly} role="status">
				Loading the registration form
			</p>
			<div className={styles.frame} aria-hidden="true">
				<div className={styles.layout}>
					<section className={styles.builder}>
						<header className={styles.head}>
							<div className={styles.headText}>
								<h3 className={styles.title}>Registration form</h3>
								<p className={styles.lead}>
									What guests answer when they register, in this order
								</p>
							</div>
							<span className={`${styles.bone} ${styles.boneCount}`} />
							<span className={`${styles.secondary} ${styles.previewButton}`}>
								Preview
							</span>
						</header>
						<div className={styles.sheet}>
							<ol className={styles.list}>
								{STARTING.map((row) => (
									<li key={row} className={styles.row}>
										<div className={styles.rowHead}>
											<span className={styles.handle} />
											<span className={styles.rowMain}>
												<span
													className={`${styles.kindTile} ${styles.boneTile}`}
												/>
												<span className={styles.rowText}>
													<span
														className={`${styles.bone} ${styles.boneTitle}`}
													/>
													<span className={styles.rowMeta}>
														<span className={`${styles.tag} ${styles.boneTag}`}>
															{row}
														</span>
													</span>
												</span>
											</span>
											<span className={styles.boneTools} />
										</div>
									</li>
								))}
							</ol>
							<div className={styles.sheetFoot}>
								<span className={`${styles.addButton} ${styles.boneAdd}`}>
									Add a field
								</span>
							</div>
						</div>
					</section>
					<div className={styles.side}>
						<span className={`${styles.bone} ${styles.bonePreview}`} />
					</div>
				</div>
			</div>
		</main>
	);
}
