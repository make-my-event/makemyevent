import type { EventRole } from "@makemyevent/core";

/**
 * The dashboard's data shapes and URLs, in one place: the layout, both pages,
 * the toolbar and its client parts all read them. Plain types, no Prisma
 * import — the organization model does not exist yet, and this screen does
 * not need it to.
 */

/** Somewhere a person's events live. Today that is only themselves. */
export type Workspace = {
	id: string;
	name: string;
	/** Where choosing it goes. The layout builds it, so the switcher stays dumb. */
	href: string;
	/** A person's own events, as opposed to an organization's. */
	personal: boolean;
};

/**
 * The dashboard's two lists. Each is its own route — /dashboard and
 * /dashboard/attending — not a ?view= on one page: they hold different things
 * (a workspace's events, a person's tickets), so they get their own
 * skeletons, empty states and titles, and the toolbar in the layout above
 * them stays mounted while someone moves between the two.
 */
export type DashboardView = "organized" | "attending";

export const DASHBOARD_VIEWS: readonly DashboardView[] = [
	"organized",
	"attending",
];

/** The view a route segment names, or the default for anything else. */
export function viewFromSegment(segment: string | null): DashboardView {
	return DASHBOARD_VIEWS.find((view) => view === segment) ?? "organized";
}

/** The search box's text, bounded so a long URL cannot be pushed into a query. */
export function parseQuery(
	value: string | string[] | null | undefined,
): string {
	return typeof value === "string" ? value.slice(0, 120).trim() : "";
}

/**
 * A view's URL. The search rides along: the box is shared by both lists, so
 * the filter in it is too, and switching lists does not quietly empty it.
 */
export function viewHref(view: DashboardView, query: string): string {
	// Organized is the dashboard itself; Attending has its own address.
	const path = view === "organized" ? "/dashboard" : `/dashboard/${view}`;
	return query ? `${path}?${new URLSearchParams({ q: query })}` : path;
}

/**
 * Where an organized event stands, as the status tabs split them. Worked out
 * from the event, never stored: "today" and "completed" change with the
 * clock, and a stored copy would go stale overnight.
 */
export type EventPhase = "today" | "draft" | "upcoming" | "completed";

export const EVENT_PHASES: readonly EventPhase[] = [
	"today",
	"draft",
	"upcoming",
	"completed",
];

export const PHASE_LABELS: Record<EventPhase, string> = {
	today: "Today",
	draft: "Draft",
	upcoming: "Upcoming",
	completed: "Completed",
};

/** The status filter a URL names, or null for all of them. */
export function parsePhase(
	value: string | string[] | null | undefined,
): EventPhase | null {
	return EVENT_PHASES.find((phase) => phase === value) ?? null;
}

/**
 * What one card on the Organized list needs, and nothing more. Times are ISO
 * strings so the shape crosses the server/client boundary unchanged.
 */
export type OrganizedEvent = {
	id: string;
	/** The event's address: /event/{slug} in public, /dashboard/{slug} here. */
	slug: string;
	/**
	 * Short public code, printed on passes: "TN-204". Null until codes exist;
	 * the card leaves it out.
	 */
	code: string | null;
	title: string;
	venue: string | null;
	/** Null on a draft whose dates are not set yet; a published event has both. */
	startsAt: string | null;
	endsAt: string | null;
	/** IANA zone the event happens in; dates are shown in it, not the viewer's. */
	timeZone: string | null;
	published: boolean;
	/** What the reader is to it; the card offers only what that role may do. */
	role: EventRole;
	registrations: number;
	/** Organizer-supplied artwork. Null until one is uploaded. */
	coverUrl: string | null;
	/** The public page, for the copy-link action. */
	publicUrl: string;
};

/** The Organized list's URL, /dashboard, with its search and status filter. */
export function organizedHref(query: string, phase: EventPhase | null): string {
	const params = new URLSearchParams();
	if (query) params.set("q", query);
	if (phase) params.set("status", phase);
	const search = params.toString();
	return search ? `/dashboard?${search}` : "/dashboard";
}
