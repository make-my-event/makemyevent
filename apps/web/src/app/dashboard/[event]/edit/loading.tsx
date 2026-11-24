import { env } from "@/lib/env";
import shell from "../event-shell.module.css";
import { AboutEditorSkeleton } from "./about-editor-skeleton";
import page from "./event-page.module.css";
import styles from "./event-page-skeleton.module.css";
import pair from "./schedule-venue.module.css";
import links from "./social-links.module.css";

/**
 * The Event Page while it loads, in the page's own frames: the poster and
 * its address, Registration behaviour, About, Schedule and Venue, Social
 * links. Headings are the real ones; what the event fills in is a bone at
 * the height of the field it stands in for, so nothing moves when it lands.
 */
/** Registration behaviour's rows, in their usual wording. */
const ROWS = [
	{
		label: "Invite only",
		description: "Every ticket needs an invite to register",
	},
	{
		label: "Public listing",
		description: `Show on ${new URL(env.appUrl).host}/explore once it is published`,
	},
	{
		label: "Capacity",
		description: "Places in all. Leave empty for no limit.",
		capacity: true,
	},
	{
		label: "Close registration",
		description: "Stop accepting registrations now",
	},
];

export default function EventPageLoading() {
	return (
		<main aria-busy="true">
			<p className={shell.srOnly} role="status">
				Loading the event page
			</p>
			<div className={page.layout} aria-hidden="true">
				<div className={page.media}>
					<div className={`${page.poster} ${styles.poster}`} />
					<span className={styles.status} />
					<span className={styles.field} />
				</div>

				<section className={page.behaviour}>
					<header className={page.behaviourHead}>
						<h3 className={page.behaviourTitle}>Registration behaviour</h3>
						<p className={page.behaviourLead}>How guests get in</p>
					</header>
					<div className={page.card}>
						{ROWS.map((row) => (
							<div key={row.label} className={page.row}>
								<div className={page.rowText}>
									<p className={page.rowLabel}>{row.label}</p>
									<p className={page.rowDescription}>{row.description}</p>
								</div>
								<span
									className={`${row.capacity ? page.capacity : page.switch} ${styles.boneControl}`}
								/>
							</div>
						))}
						<span className={`${page.advanced} ${styles.boneControl}`}>
							Advanced settings
						</span>
					</div>
				</section>

				<AboutEditorSkeleton />

				<div className={pair.pairRow}>
					<section className={pair.panel}>
						<header className={pair.panelHead}>
							<h3 className={pair.panelTitle}>Schedule & Registration</h3>
							<p className={pair.panelLead}>When it runs, on local time</p>
						</header>
						<div className={`${pair.card} ${styles.scheduleCard}`} />
					</section>
					<section className={pair.panel}>
						<header className={pair.panelHead}>
							<h3 className={pair.panelTitle}>Venue</h3>
							<p className={pair.panelLead}>Where guests go</p>
						</header>
						<div className={`${pair.card} ${styles.venueCard}`} />
					</section>
				</div>

				<section className={`${pair.panel} ${links.panel}`}>
					<header className={pair.panelHead}>
						<h3 className={pair.panelTitle}>Social links</h3>
						<p className={pair.panelLead}>
							At the foot of your event page, in this order
						</p>
					</header>
					<div className={`${pair.card} ${styles.linksCard}`} />
				</section>
			</div>
		</main>
	);
}
