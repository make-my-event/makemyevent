import Link from "next/link";
import { CalendarIcon, QrIcon, RightIcon } from "@/components/icons";
import { cardWhen } from "@/lib/event-text";
import { imageUrl } from "@/lib/storage";
import styles from "./events.module.css";
import type { MyTicket } from "./my-tickets";
import { initialsOf } from "./organized-events";
import { ticketState } from "./ticket-state";

/**
 * One ticket on the Attending list: the Organized card's frame, so the two
 * lists read as one, with the ticket and its code where the host's numbers
 * are. The whole card opens the pass.
 */
export function TicketCard({ ticket, now }: { ticket: MyTicket; now: Date }) {
	const state = ticketState(ticket, now);
	const startsAt = ticket.startsAt?.toISOString() ?? null;
	const place =
		ticket.format === "online"
			? "Online"
			: (ticket.venueName ?? ticket.venueAddress ?? "Venue not set");

	return (
		<article className={styles.card}>
			<div className={styles.cover}>
				{ticket.posterPath ? (
					// biome-ignore lint/performance/noImgElement: user-uploaded artwork from storage, not a build-time asset
					<img
						className={styles.coverImage}
						src={imageUrl(`${ticket.posterPath}-540.webp`)}
						alt=""
						loading="lazy"
						decoding="async"
					/>
				) : (
					<div className={styles.coverPlaceholder} aria-hidden="true">
						<span className={styles.coverInitials}>
							{initialsOf(ticket.eventTitle)}
						</span>
					</div>
				)}
			</div>

			<div className={styles.info}>
				<div className={styles.details}>
					<div className={styles.heading}>
						<h2 className={styles.title}>{ticket.eventTitle}</h2>
					</div>

					<p className={styles.place}>
						{state.label ? (
							<span className={styles.code}>{state.label}</span>
						) : null}
						<span className={styles.venue}>{place}</span>
					</p>

					<p className={styles.meta}>
						<CalendarIcon className={styles.metaIcon} />
						{startsAt ? (
							<time className={styles.when} dateTime={startsAt}>
								{cardWhen(startsAt, ticket.timeZone)}
							</time>
						) : (
							<span className={styles.when}>
								{cardWhen(null, ticket.timeZone)}
							</span>
						)}
					</p>

					<p className={`${styles.meta} ${styles.metaStrong}`}>
						<QrIcon className={styles.metaIcon} />
						<span className={styles.count}>
							{ticket.ticketName} · {ticket.ticketCode}
						</span>
					</p>
				</div>

				<div className={styles.manageArea}>
					<div className={styles.tear} />
					<div className={styles.footer}>
						<Link
							className={styles.manage}
							href={`/dashboard/attending/${ticket.id}`}
							title={ticket.eventTitle}
						>
							{state.hasPass ? "Pass" : "Details"}
							<span className={styles.srOnly}> for {ticket.eventTitle}</span>
							<RightIcon className={styles.manageIcon} />
						</Link>
					</div>
				</div>
			</div>
		</article>
	);
}
