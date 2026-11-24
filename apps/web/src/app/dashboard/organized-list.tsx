import Link from "next/link";
import { EmptyState } from "./empty-state";
import { StatusTabsScroller } from "./status-tabs-scroller";
import { EventCard } from "./event-card";
import styles from "./events.module.css";
import { listOrganized } from "./organized-events";
import {
	EVENT_PHASES,
	type EventPhase,
	type OrganizedEvent,
	PHASE_LABELS,
	organizedHref,
} from "./types";

/**
 * The Organized list (Figma: TechNova events › Event filters + Organized
 * events): status tabs with their counts, then the cards.
 *
 * The tabs are links, not buttons: each filter is a URL, so it survives a
 * reload and the back button, and works without script. "All" comes first
 * and is chosen when no filter is, so one tab always shows what the list is.
 */
export function OrganizedList({
	events,
	query,
	phase,
	now,
	createAction,
}: {
	events: readonly OrganizedEvent[];
	query: string;
	phase: EventPhase | null;
	now: Date;
	/** Opens the same Create Event popup as the toolbar's button. */
	createAction: React.ReactNode;
}) {
	if (events.length === 0) {
		return (
			<EmptyState
				title="No events yet"
				body="Create one and you get a page to share, QR passes for everyone who registers, and a scanner for the door."
				action={createAction}
			/>
		);
	}

	const { shown, counts } = listOrganized(events, query, phase, now);
	const scope = phase ? PHASE_LABELS[phase] : "All";
	const total = EVENT_PHASES.reduce((sum, value) => sum + counts[value], 0);
	const tabs: readonly {
		value: EventPhase | null;
		label: string;
		count: number;
	}[] = [
		{ value: null, label: "All", count: total },
		...EVENT_PHASES.map((value) => ({
			value,
			label: PHASE_LABELS[value],
			count: counts[value],
		})),
	];

	return (
		<div className={styles.list}>
			<div className={styles.filters}>
				<StatusTabsScroller className={styles.tabs} current={phase ?? "all"}>
					{tabs.map((tab) => {
						const current = tab.value === phase;
						return (
							<Link
								key={tab.label}
								className={`${styles.tab} ${current ? styles.tabCurrent : ""}`}
								href={organizedHref(query, tab.value)}
								aria-current={current ? "page" : undefined}
							>
								{tab.label}
								<span className={styles.tabCount}>
									<span className={styles.srOnly}>, </span>
									{tab.count}
								</span>
							</Link>
						);
					})}
				</StatusTabsScroller>
			</div>

			{shown.length > 0 ? (
				<ul className={styles.grid}>
					{shown.map((event) => (
						<li key={event.id}>
							<EventCard event={event} />
						</li>
					))}
				</ul>
			) : query ? (
				<EmptyState
					title={`Nothing matched “${query}”`}
					body={
						phase
							? `Nothing in ${scope} matches. Search looks at event names and codes.`
							: "Search looks at event names and codes in this workspace."
					}
					action={{ label: "Clear search", href: organizedHref("", phase) }}
				/>
			) : (
				<EmptyState
					title={`No ${scope.toLowerCase()} events`}
					body={EMPTY_PHASE_BODY[phase ?? "upcoming"]}
					action={{ label: "View all events", href: organizedHref("", null) }}
				/>
			)}
		</div>
	);
}

const EMPTY_PHASE_BODY: Record<EventPhase, string> = {
	today: "Nothing of yours runs today. Events show here on the day they start.",
	draft: "Every event in this workspace is published.",
	upcoming: "Nothing is scheduled ahead. Publish a draft or create an event.",
	completed: "Events show here once they have ended.",
};
