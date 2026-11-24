import Link from "next/link";
import { ROLE_LABELS, managesEvent } from "@makemyevent/core";
import { CopyEventLink } from "./copy-event-link";
import { DeleteEventButton } from "./delete-event-button";
import {
	CalendarIcon,
	DuplicateIcon,
	EditIcon,
	PeopleIcon,
	RightIcon,
} from "@/components/icons";
import styles from "./events.module.css";
import { formatWhen, initialsOf } from "./organized-events";
import type { OrganizedEvent } from "./types";

const registered = new Intl.NumberFormat("en-US");

/**
 * One event on the Organized list (Figma: TechNova events › Event card).
 *
 *   ┌──────┐ Title                          [⧉]
 *   │ art  │ #CODE  Venue
 *   │      │ 📅 Nov 24, 2026 · 11:00 AM
 *   │      │ 👥 640 registered
 *   │      │ - - - - - - - - - - - - - - - - - -
 *   └──────┘ [Manage ›]              ✎  🔗  🗑
 *
 * Every line is one line: the title truncates rather than wraps, so every
 * card is the same height and the skeleton can be sized to it exactly.
 *
 * Manage, Edit and Duplicate are URLs, so they work without script and open
 * in a new tab. Copying the link and deleting act here; Delete asks first in
 * a popup, since it cannot be undone.
 */
export function EventCard({ event }: { event: OrganizedEvent }) {
	const base = `/dashboard/${encodeURIComponent(event.slug)}`;
	const canEdit = managesEvent(event.role);

	return (
		<article className={styles.card}>
			<div className={styles.cover}>
				{event.coverUrl ? (
					// Organizer artwork at any size; the frame crops it. Decorative,
					// since the title beside it says the same thing.
					// biome-ignore lint/performance/noImgElement: user-uploaded artwork from storage, not a build-time asset
					<img
						className={styles.coverImage}
						src={event.coverUrl}
						alt=""
						loading="lazy"
						decoding="async"
					/>
				) : (
					<div className={styles.coverPlaceholder} aria-hidden="true">
						<span className={styles.coverInitials}>
							{initialsOf(event.title)}
						</span>
						{event.code ? (
							<span className={styles.coverCode}>{event.code}</span>
						) : null}
					</div>
				)}
			</div>

			<div className={styles.info}>
				<div className={styles.details}>
					<div className={styles.heading}>
						<h2 className={styles.title} title={event.title}>
							{event.title}
						</h2>
						{canEdit ? (
							// Copying an event (its page, tickets and form) is not built
							// yet: a button that says so, not a blank Create Event.
							<button
								type="button"
								className={`${styles.action} ${styles.actionOutlined}`}
								aria-disabled="true"
								title="Duplicate is coming soon"
							>
								<span className={styles.srOnly}>
									Duplicate {event.title}, coming soon
								</span>
								<DuplicateIcon />
							</button>
						) : null}
					</div>

					<p className={styles.place}>
						{event.role !== "owner" ? (
							<span className={styles.code}>
								<span className={styles.srOnly}>Your role: </span>
								{ROLE_LABELS[event.role]}
							</span>
						) : null}
						{event.code ? (
							<span className={styles.code}>
								<span className={styles.srOnly}>Event code </span>#{event.code}
							</span>
						) : null}
						<span className={styles.venue}>
							{event.venue ?? "Venue not set"}
						</span>
					</p>

					<p className={styles.meta}>
						<CalendarIcon className={styles.metaIcon} />
						{event.startsAt ? (
							<time className={styles.when} dateTime={event.startsAt}>
								{formatWhen(event)}
							</time>
						) : (
							<span className={styles.when}>{formatWhen(event)}</span>
						)}
					</p>

					{event.published ? (
						<p className={`${styles.meta} ${styles.metaStrong}`}>
							<PeopleIcon className={styles.metaIcon} />
							<span className={styles.count}>
								{registered.format(event.registrations)} registered
							</span>
						</p>
					) : (
						// Unpublished has no colour of its own: muted text, an
						// icon and the words.
						<p className={styles.meta}>
							<EditIcon className={styles.metaIconMuted} />
							<span className={styles.when}>Draft, not visible to buyers</span>
						</p>
					)}
				</div>

				<div className={styles.manageArea}>
					<div className={styles.tear} />
					<div className={styles.footer}>
						<Link className={styles.manage} href={`${base}/overview`}>
							Manage
							<span className={styles.srOnly}> {event.title}</span>
							<RightIcon className={styles.manageIcon} />
						</Link>

						<div className={styles.actions}>
							{canEdit ? (
								<Link
									className={styles.action}
									href={`${base}/edit`}
									title="Edit"
								>
									<span className={styles.srOnly}>Edit {event.title}</span>
									<EditIcon />
								</Link>
							) : null}
							<CopyEventLink url={event.publicUrl} title={event.title} />
							{/* Only the owner, and only a draft, as the database says too: a
							    published event has ticket holders and is cancelled instead. */}
							{event.role === "owner" && !event.published ? (
								<DeleteEventButton eventId={event.id} title={event.title} />
							) : null}
						</div>
					</div>
				</div>
			</div>
		</article>
	);
}
