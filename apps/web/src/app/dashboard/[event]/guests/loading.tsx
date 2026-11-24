import { RightIcon } from "@/components/icons";
import shell from "../event-shell.module.css";
import glance from "../overview/glance.module.css";
import styles from "./guests.module.css";

/**
 * Guests while they load: the Glance, the three cards and the list's head,
 * in their own frames, with a few rows at a row's height. The heading and
 * the column names are the real ones.
 */
/** The cards' own words, so they wrap as the page's will. */
const CARDS = [
	["Invites", "Add guests yourself, one or many"],
	["Blocklist", "Emails and numbers that can't register"],
	["Dropped", "Started registering, didn't finish"],
] as const;

export default function GuestsLoading() {
	return (
		<main aria-busy="true">
			<p className={shell.srOnly} role="status">
				Loading guests
			</p>
			<div aria-hidden="true">
				<div className={glance.card}>
					<div className={glance.header}>
						<span className={`${glance.bone} ${glance.boneTitle}`} />
						<span className={`${glance.bone} ${glance.boneLast}`} />
					</div>
					<div className={glance.body}>
						<span className={`${glance.bone} ${glance.boneTotal}`} />
						<div className={glance.bar} />
						<span className={`${glance.bone} ${glance.boneLegend}`} />
					</div>
				</div>
				<ul className={styles.cards}>
					{CARDS.map(([title, body]) => (
						<li key={title} className={styles.cardSlot}>
							<div className={styles.cardItem}>
								<span className={`${styles.cardIcon} ${styles.boneTile}`} />
								<span className={styles.cardText}>
									<span className={styles.cardTitle}>{title}</span>
									<span className={styles.cardBody}>{body}</span>
								</span>
								{title === "Dropped" ? (
									<span className={`${styles.soonTag} ${styles.boneTile}`}>
										Coming soon
									</span>
								) : (
									<>
										<span className={`${styles.cardCount} ${styles.boneTile}`}>
											0
										</span>
										<span className={styles.cardGo} aria-hidden="true">
											<RightIcon />
										</span>
									</>
								)}
							</div>
						</li>
					))}
				</ul>
				<section className={styles.list}>
					<header className={styles.listHead}>
						<h3 className={styles.listTitle}>Guests</h3>
						<span className={`${styles.searchInput} ${styles.boneField}`} />
						<span className={`${styles.bone} ${styles.boneTools}`} />
					</header>
					<div className={styles.tableWrap}>
						{[1, 2, 3, 4, 5].map((row) => (
							<div key={row} className={styles.boneRow}>
								<span className={`${styles.avatar} ${styles.boneTile}`} />
								<span className={`${styles.bone} ${styles.boneLine}`} />
							</div>
						))}
					</div>
				</section>
			</div>
		</main>
	);
}
