import { zoneShort } from "@makemyevent/core";
import Link from "next/link";
import { CalendarIcon, RightIcon } from "@/components/icons";
import { imageUrl } from "@/lib/storage";
import { initialsOf } from "../organized-events";
import { PHASE_LABELS } from "../types";
import { daysUntil, eventPhase } from "./event-phase";
import styles from "./event-header.module.css";
import { findManagedEvent, type ManagedEvent } from "./load-event";

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/**
 * The event's name, date and state, above every section. It sits in the
 * layout, so it stays put while someone moves between sections.
 *
 *   ‹  ┌──┐  Unwind Circle: A Mini Workshop
 *      │UC│  📅 Sat, Nov 22, 2026 · 6:00 PM GMT+5:30   ● Upcoming · tomorrow
 *      └──┘
 *
 * The tile is the event's logo; without one its initials,
 * drawn like the cover on the Organized list. The last part counts down in
 * the event's own calendar days, so a host sees at once how close it is.
 *
 * Signed out, or not theirs: nothing here. The section's page answers those.
 */
export async function EventHeader({ slug }: { slug: string }) {
	const event = await findManagedEvent(slug);
	return event ? <EventHeaderView event={event} now={new Date()} /> : null;
}

/** The header itself, from the event; apart from the lookup so it can be seen alone. */
export function EventHeaderView({
	event,
	now,
}: {
	event: Pick<
		ManagedEvent,
		"title" | "status" | "startsAt" | "endsAt" | "timeZone" | "logoPath"
	>;
	now: Date;
}) {
	const published = event.status === "published";
	const phase = eventPhase({ ...event, published }, now);
	const days = daysUntil(event.startsAt, event.timeZone, now);

	return (
		<header className={styles.header}>
			<Link className={styles.back} href="/dashboard" title="All events">
				<RightIcon className={styles.backIcon} />
				<span className={styles.srOnly}>All events</span>
			</Link>

			<div className={styles.tile} aria-hidden="true">
				{event.logoPath ? (
					// biome-ignore lint/performance/noImgElement: user-uploaded artwork from storage, not a build-time asset
					<img
						className={styles.tileImage}
						src={imageUrl(`${event.logoPath}-256.webp`)}
						alt=""
						decoding="async"
					/>
				) : (
					initialsOf(event.title) || "E"
				)}
			</div>

			<div className={styles.text}>
				<h1 className={styles.title} title={event.title}>
					{event.title}
				</h1>
				<p className={styles.meta}>
					<span className={styles.when}>
						<CalendarIcon className={styles.metaIcon} />
						{event.startsAt ? (
							<time dateTime={event.startsAt.toISOString()}>
								{formatStart(event.startsAt, event.timeZone)}
								<span className={styles.zone}>
									{" "}
									{zoneShort(event.startsAt, event.timeZone)}
								</span>
							</time>
						) : (
							<span className={styles.unset}>Date not set</span>
						)}
					</span>
					<span className={styles.status} data-phase={phase}>
						<span className={styles.dot} aria-hidden="true" />
						{PHASE_LABELS[phase]}
						{days !== null && phase !== "completed" && days !== 0 ? (
							<span className={styles.countdown}>
								{" · "}
								{relative.format(days, "day")}
							</span>
						) : null}
					</span>
				</p>
			</div>
		</header>
	);
}

/** "Sat, Nov 22, 2026 · 6:00 PM", in the event's own zone. */
function formatStart(startsAt: Date, timeZone: string | null): string {
	const zone = timeZone ?? "UTC";
	const date = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(startsAt);
	const time = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hour: "numeric",
		minute: "2-digit",
	}).format(startsAt);
	return `${date} · ${time}`;
}

/** The header's shape while the event loads: tile, a title line, a meta line. */
export function EventHeaderSkeleton() {
	return (
		<div className={styles.header} aria-hidden="true">
			<span className={styles.back} />
			<span className={`${styles.tile} ${styles.bone}`} />
			<div className={styles.text}>
				<span className={`${styles.bone} ${styles.boneTitle}`} />
				<span className={`${styles.bone} ${styles.boneMeta}`} />
				<span className={`${styles.bone} ${styles.boneMetaPhone}`} />
			</div>
		</div>
	);
}
