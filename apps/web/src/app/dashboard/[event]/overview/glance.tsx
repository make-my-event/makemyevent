import Link from "next/link";
import type { Glance, Tone } from "./glance-data";
import styles from "./glance.module.css";

const count = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const TONE_CLASS: Record<Tone, string | undefined> = {
	1: styles.tone1,
	2: styles.tone2,
	3: styles.tone3,
	4: styles.tone4,
	5: styles.tone5,
	rest: styles.toneRest,
};

/**
 * The Overview's first card: how many have registered, against how many
 * places, split by ticket. Kept compact: it is a glance, not the whole story.
 * The event's phase is in the event header above, and its link in the Share
 * card below, so neither is repeated here.
 *
 *   Summary                            Last registered 20 Nov 2026, 22:37
 *   23/500 (4.6% filled)
 *   [██▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]
 *   ● 12 Students   ● 11 Professionals   ○ 477 Remaining
 *
 * Every number is in words as well as in the bar, so the bar is hidden from
 * screen readers. Every state keeps the same rows, so the skeleton matches
 * it and nothing moves when it arrives.
 */
export function GlanceCard({
	glance,
	timeZone,
	limitHref,
	checkedIn,
}: {
	glance: Glance;
	timeZone: string | null;
	/**
	 * Where the event's place limit is set, for those who may change it; left
	 * out, the limit (or its absence) is only stated.
	 */
	limitHref?: string | undefined;
	/** Guests checked in so far; left out where check-in isn't the subject. */
	checkedIn?: number | undefined;
}) {
	const { registered, limit, remaining, fill } = glance;

	return (
		<section className={styles.card} aria-labelledby="glance-title">
			<header className={styles.header}>
				<h3 className={styles.title} id="glance-title">
					Summary
				</h3>
				<LastRegistered at={glance.lastRegisteredAt} timeZone={timeZone} />
			</header>

			<div className={styles.body}>
				<p className={styles.total}>
					<span className={styles.registered}>{count.format(registered)}</span>
					{limit === null ? (
						<>
							<span className={`${styles.of} ${styles.unit}`}>registered</span>
							<span className={styles.note}>
								(no limit on places
								{limitHref ? (
									<>
										,{" "}
										<Link className={styles.limitLink} href={limitHref}>
											set one
										</Link>
									</>
								) : null}
								)
							</span>
						</>
					) : (
						<>
							<span className={styles.of}>
								<span className={styles.srOnly}> registered of </span>
								<span aria-hidden="true">/</span>
								{count.format(limit)}
							</span>
							<span className={styles.note}>
								{fill === "sold-out" ? (
									<strong className={styles.soldOut}>Sold out</strong>
								) : (
									`(${percent.format(glance.percentFilled ?? 0)}% filled${
										fill === "almost-full" ? ", almost full" : ""
									})`
								)}
								{limitHref ? (
									<>
										{" "}
										<Link className={styles.limitLink} href={limitHref}>
											Change limit
										</Link>
									</>
								) : null}
							</span>
						</>
					)}
					{checkedIn !== undefined ? (
						<span className={styles.checkedIn}>
							<span className={styles.checkedInCount}>
								{count.format(checkedIn)}
							</span>{" "}
							checked in
						</span>
					) : null}
				</p>

				<div className={styles.bar} aria-hidden="true">
					{glance.segments.map((segment) => (
						<span
							key={segment.tone}
							className={`${styles.segment} ${TONE_CLASS[segment.tone]}`}
							style={{ inlineSize: `${segment.share}%` }}
						/>
					))}
				</div>

				<ul
					className={styles.legend}
					aria-label={glance.splitBy ? `By ${glance.splitBy}` : "By ticket"}
				>
					{glance.splitBy ? (
						<li className={styles.legendBy} aria-hidden="true">
							{glance.splitBy}
						</li>
					) : null}
					{glance.groups.map((type) => (
						<li key={type.id} className={styles.legendItem}>
							<span
								className={`${styles.dot} ${TONE_CLASS[type.tone]}`}
								aria-hidden="true"
							/>
							<span className={styles.legendCount}>
								{count.format(type.registered)}
							</span>
							<span className={styles.legendName}>{type.name}</span>
						</li>
					))}
					{remaining !== null ? (
						<li className={`${styles.legendItem} ${styles.legendMuted}`}>
							<span
								className={`${styles.dot} ${styles.dotEmpty}`}
								aria-hidden="true"
							/>
							<span className={styles.legendCount}>
								{count.format(remaining)}
							</span>
							<span className={styles.legendName}>Remaining</span>
						</li>
					) : null}
				</ul>
			</div>
		</section>
	);
}

function LastRegistered({
	at,
	timeZone,
}: {
	at: Date | null;
	timeZone: string | null;
}) {
	if (!at) return <p className={styles.last}>No registrations yet</p>;

	// In the event's own zone, like every date in its dashboard.
	const zone = timeZone ?? "UTC";
	const when = new Intl.DateTimeFormat("en-GB", {
		timeZone: zone,
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(at);

	return (
		<p className={styles.last}>
			Last registered{" "}
			<time
				className={styles.lastWhen}
				dateTime={at.toISOString()}
				title={zone}
			>
				{when}
			</time>
		</p>
	);
}
