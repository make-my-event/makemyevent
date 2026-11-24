import shell from "../event-shell.module.css";
import styles from "./glance.module.css";
import { RecentRegistrationsSkeleton } from "./recent-registrations";
import { ShareCardSkeleton } from "./share-card";
import { TeamCardSkeleton } from "./team-card";

/**
 * The Overview while it loads: the Glance, Share and Recent registrations cards, each line at the height of
 * the one it stands in for, so nothing moves when the real card arrives. The
 * event header and the sidebar are in the layout and stay put.
 */
export default function OverviewLoading() {
	return (
		<main aria-busy="true">
			<p className={shell.srOnly} role="status">
				Loading overview
			</p>
			<div className={styles.card} aria-hidden="true">
				<div className={styles.header}>
					<span className={`${styles.bone} ${styles.boneTitle}`} />
					<span className={`${styles.bone} ${styles.boneLast}`} />
				</div>
				<div className={styles.body}>
					<span className={`${styles.bone} ${styles.boneTotal}`} />
					<div className={styles.bar} />
					<span className={`${styles.bone} ${styles.boneLegend}`} />
				</div>
			</div>
			<ShareCardSkeleton />
			<RecentRegistrationsSkeleton />
			<TeamCardSkeleton />
		</main>
	);
}
