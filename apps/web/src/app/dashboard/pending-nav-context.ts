"use client";

import { createContext, type ReactNode, useContext } from "react";

/** Where a move inside the dashboard is going, while it is on its way. */
export type NavTarget = { pathname: string; search: string };

/**
 * Each page's loading skeleton, drawn by the server once and handed down, so
 * one can be shown the instant a link is pressed. They are the same elements
 * as each route's loading.tsx, so the hand-over to Next's own loading state
 * changes nothing on screen.
 */
export type DashboardSkeletons = {
	toolbar: ReactNode;
	organized: ReactNode;
	attending: ReactNode;
	eventHeader: ReactNode;
	overview: ReactNode;
	edit: ReactNode;
	formBuilder: ReactNode;
	guests: ReactNode;
	tickets: ReactNode;
	scan: ReactNode;
	section: ReactNode;
};

export type PendingNav = {
	/** Set from the press until the new page has been drawn. */
	target: NavTarget | null;
	/** Goes to an address inside the dashboard, showing its skeleton at once. */
	navigate: (href: string) => void;
	skeletons: DashboardSkeletons | null;
};

export const PendingNavContext = createContext<PendingNav>({
	target: null,
	navigate: (href) => window.location.assign(href),
	skeletons: null,
});

export function usePendingNav(): PendingNav {
	return useContext(PendingNavContext);
}

/** A dashboard address, as the part of the dashboard it opens. */
export type DashboardPlace =
	| { area: "lists"; view: "organized" | "attending" }
	| { area: "event"; slug: string; section: string };

/**
 * /dashboard and /dashboard/attending are the lists; /dashboard/{event} and
 * /dashboard/{event}/{section} are one event. "attending" is a reserved
 * event address, so the two never meet. Anything else (settings, deeper
 * paths) is not a page these skeletons know, and null.
 */
export function placeOf(pathname: string): DashboardPlace | null {
	const parts = pathname.split("/").filter(Boolean);
	if (parts[0] !== "dashboard" || parts.length > 3) return null;
	if (parts.length === 1) return { area: "lists", view: "organized" };
	const [, first = "", second] = parts;
	if (first === "attending")
		return second === undefined ? { area: "lists", view: "attending" } : null;
	if (first === "settings") return null;
	let slug: string;
	try {
		slug = decodeURIComponent(first);
	} catch {
		return null;
	}
	// /dashboard/{event} on its own opens the Overview.
	return { area: "event", slug, section: second ?? "overview" };
}
