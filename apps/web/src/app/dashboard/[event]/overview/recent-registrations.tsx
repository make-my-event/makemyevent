import Link from "next/link";
import type { Tone } from "./glance-data";
import glanceStyles from "./glance.module.css";
import styles from "./recent-registrations.module.css";
import { exactTime, timeAgo } from "./time-ago";

/** How many the Overview lists; the Guests section has the rest. */
export const RECENT_LIMIT = 10;

export type RecentRegistration = {
	id: string;
	name: string;
	email: string;
	ticketName: string;
	/** The ticket's colour in the Glance bar, so the two read together. */
	tone: Tone;
	at: Date;
};

const TONE_CLASS: Record<Tone, string | undefined> = {
	1: glanceStyles.tone1,
	2: glanceStyles.tone2,
	3: glanceStyles.tone3,
	4: glanceStyles.tone4,
	5: glanceStyles.tone5,
	rest: glanceStyles.toneRest,
};

const count = new Intl.NumberFormat("en-US");

/**
 * The newest registrations, newest first: who, how to reach them, on which
 * ticket, and when. A real table, so a screen reader reads each cell with
 * its column. On phones the email column gives way and the email sits under
 * the name, so it stays a table there too.
 */
export function RecentRegistrationsCard({
	rows,
	total,
	guestsHref,
	timeZone,
	now,
}: {
	rows: RecentRegistration[];
	total: number;
	guestsHref: string;
	timeZone: string | null;
	now: Date;
}) {
	return (
		<section className={styles.card} aria-labelledby="recent-title">
			<header className={styles.header}>
				<h3 className={styles.title} id="recent-title">
					Recent registrations
				</h3>
				{rows.length > 0 ? (
					<Link className={styles.viewAll} href={guestsHref}>
						View all
					</Link>
				) : null}
			</header>

			{rows.length === 0 ? (
				<div className={styles.empty}>
					<p className={styles.emptyTitle}>No registrations yet</p>
					<p className={styles.emptyText}>
						The newest ones appear here as people register.
					</p>
				</div>
			) : (
				<>
					<table className={styles.table}>
						<thead className={styles.head}>
							<tr>
								<th scope="col">Attendee</th>
								<th scope="col" className={styles.emailHead}>
									Email
								</th>
								<th scope="col" className={styles.ticketHead}>
									Ticket
								</th>
								<th scope="col" className={`${styles.end} ${styles.whenHead}`}>
									Registered
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.id} className={styles.row}>
									<td className={styles.attendeeCell}>
										{/* A flex box inside the cell: a cell itself must stay a cell. */}
										<div className={styles.attendee}>
											<span className={styles.avatar} aria-hidden="true">
												{initialOf(row.name)}
											</span>
											<span className={styles.who}>
												<span className={styles.name} title={row.name}>
													{row.name}
												</span>
												{/* Phones: the email column gives way, and the email moves here. */}
												<span className={styles.emailInline} title={row.email}>
													{row.email}
												</span>
												{/* Narrower still: the ticket column gives way too. */}
												<span className={styles.ticketInline}>
													<TicketChip row={row} />
												</span>
											</span>
										</div>
									</td>
									<td className={styles.email} title={row.email}>
										{row.email}
									</td>
									<td className={styles.ticket}>
										<TicketChip row={row} />
									</td>
									<td className={`${styles.when} ${styles.end}`}>
										<time
											dateTime={row.at.toISOString()}
											title={exactTime(row.at, timeZone)}
										>
											{timeAgo(row.at, now, timeZone)}
										</time>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<p className={styles.footer}>
						Showing {count.format(rows.length)} of {count.format(total)}{" "}
						{total === 1 ? "registration" : "registrations"}
					</p>
				</>
			)}
		</section>
	);
}

/** The ticket, as a chip with its Glance colour. */
function TicketChip({ row }: { row: RecentRegistration }) {
	return (
		<span className={styles.chip} title={row.ticketName}>
			<span
				className={`${glanceStyles.dot} ${TONE_CLASS[row.tone]}`}
				aria-hidden="true"
			/>
			<span className={styles.chipName}>{row.ticketName}</span>
		</span>
	);
}

/** The first letter of the name, for the avatar: "albin" → "A". */
function initialOf(name: string): string {
	const first = name.trim().match(/[\p{L}\p{N}]/u)?.[0];
	return first ? first.toLocaleUpperCase() : "?";
}

/** The card while it loads: its header and five rows. */
export function RecentRegistrationsSkeleton() {
	return (
		<div className={styles.card} aria-hidden="true">
			<div className={styles.header}>
				<span className={`${styles.bone} ${styles.boneTitle}`} />
			</div>
			<div className={styles.boneRows}>
				{[0, 1, 2, 3, 4].map((n) => (
					<div key={n} className={styles.boneRow}>
						<span className={`${styles.bone} ${styles.boneAvatar}`} />
						<span className={`${styles.bone} ${styles.boneLine}`} />
					</div>
				))}
			</div>
		</div>
	);
}
