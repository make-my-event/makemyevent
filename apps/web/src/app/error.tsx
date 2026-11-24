"use client";

import { useEffect } from "react";
import styles from "./content.module.css";

/**
 * Shown when a page fails to render. It is a client component, so it carries
 * its own wording rather than the site chrome: whatever broke may be the
 * chrome itself.
 */
export default function RenderError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Replaced by Sentry once observability lands; until then the browser
		// console is the only place this would otherwise be lost.
		console.error(error);
	}, [error]);

	return (
		<main className={styles.page}>
			<div className={`${styles.inner} ${styles.centre}`}>
				<div className={styles.column}>
					<h1 className={styles.h1}>This page did not load.</h1>
					<p className={styles.lede}>
						Something on our side failed while building it. Your account and any
						tickets you hold are unaffected.
					</p>
					<div className={styles.actions}>
						<button
							type="button"
							className={`${styles.btn} ${styles.btnPrimary}`}
							onClick={reset}
						>
							Try again
						</button>
						<a className={`${styles.btn} ${styles.btnSecondary}`} href="/">
							Go to the home page
						</a>
					</div>
					{error.digest ? (
						<p className={styles.detail}>
							Reference {error.digest}. Quote it if you contact us.
						</p>
					) : null}
				</div>
			</div>
		</main>
	);
}
