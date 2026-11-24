import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import styles from "./content.module.css";

export const metadata: Metadata = {
	title: "Page not found",
	robots: { index: false, follow: false },
};

export default function NotFound() {
	return (
		<>
			<SiteHeader />
			<main className={styles.page}>
				<div className={`${styles.inner} ${styles.centre}`}>
					<div className={styles.column}>
						<h1 className={styles.h1}>This page does not exist.</h1>
						<p className={styles.lede}>
							The link may be out of date, or the event page may have been taken
							down by its organiser.
						</p>
						<div className={styles.actions}>
							<a className={`${styles.btn} ${styles.btnPrimary}`} href="/">
								Go to the home page
							</a>
							<a
								className={`${styles.btn} ${styles.btnSecondary}`}
								href="/#features"
							>
								See what makemyevent does
							</a>
						</div>
					</div>
				</div>
			</main>
			<SiteFooter />
		</>
	);
}
