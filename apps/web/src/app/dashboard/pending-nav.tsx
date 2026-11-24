"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { EventSidebar } from "./[event]/event-sidebar";
import shell from "./[event]/event-shell.module.css";
import { SIDEBAR_COOKIE } from "./[event]/sidebar-cookie";
import {
	type DashboardPlace,
	type DashboardSkeletons,
	type NavTarget,
	PendingNavContext,
	placeOf,
	usePendingNav,
} from "./pending-nav-context";
import styles from "./pending-nav.module.css";

/**
 * Every move inside the dashboard answers the press at once.
 *
 * A link press inside /dashboard is taken here, before Next's Link handler,
 * and made the same soft navigation inside a transition. While it is on its
 * way, the part of the page that is changing shows the destination's
 * skeleton, and the pressed sidebar item or tab is already the chosen one.
 * Without this the old page sits there until the server answers, which on
 * the dev server (no prefetching, each page compiled on first visit) can be
 * seconds, and on a slow connection reads as a hang.
 *
 * Once the new page is drawn the transition ends and its own loading.tsx or
 * content takes over; the skeletons are the same elements, so nothing jumps.
 *
 * The unsaved-changes guard listens earlier, on the window, so a section
 * with edits still asks first; a press it holds never reaches this.
 * Presses that leave the page another way (new tab, modifier keys,
 * downloads, another site, addresses outside the dashboard) are left alone.
 */
export function PendingNavProvider({
	skeletons,
	children,
}: {
	skeletons: DashboardSkeletons;
	children: ReactNode;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [target, setTarget] = useState<NavTarget | null>(null);

	const navigate = useCallback(
		(href: string) => {
			const url = new URL(href, window.location.href);
			setTarget({ pathname: url.pathname, search: url.search });
			startTransition(() => {
				router.push(`${url.pathname}${url.search}${url.hash}`);
			});
		},
		[router],
	);

	useEffect(() => {
		const onClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
				return;
			const element = event.target;
			if (!(element instanceof Element)) return;
			const link = element.closest<HTMLAnchorElement>("a[href]");
			if (!link) return;
			if (link.target && link.target !== "_self") return;
			if (link.hasAttribute("download")) return;

			const url = new URL(link.href, window.location.href);
			if (url.origin !== window.location.origin) return;
			if (!placeOf(url.pathname)) return;
			// A jump within this page, or a press on the page already open.
			if (
				url.pathname === window.location.pathname &&
				url.search === window.location.search
			)
				return;

			// Next's Link sees this and stands down; its own onClick props
			// (closing the phone drawer, say) still run.
			event.preventDefault();
			navigate(url.href);
		};
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, [navigate]);

	const value = useMemo(
		() => ({ target: isPending ? target : null, navigate, skeletons }),
		[isPending, target, navigate, skeletons],
	);

	return (
		<PendingNavContext.Provider value={value}>
			{children}
		</PendingNavContext.Provider>
	);
}

/**
 * Where a layout puts the page below it. While a move is on its way that
 * changes what this level shows, the destination's skeleton stands in.
 *
 * - dashboard: a move between the lists and an event, or between two events.
 *   The whole area under the site band changes, sidebar and all.
 * - lists: Organized and Attending, or a new search. The toolbar stays.
 * - section: another section of the same event. Header and sidebar stay.
 *
 * The page being left stays mounted, only hidden, so a move that does not
 * happen (the browser's back button mid-way) finds it as it was.
 */
export function PendingSlot({
	level,
	children,
}: {
	level: "dashboard" | "lists" | "section";
	children: ReactNode;
}) {
	const { target, skeletons } = usePendingNav();
	const pathname = usePathname();
	const search = useSearchParams().toString();

	let fallback: ReactNode = null;
	if (target && skeletons) {
		const here = placeOf(pathname);
		const there = placeOf(target.pathname);
		const searchChanged = target.search.replace(/^\?/, "") !== search;
		if (here && there)
			fallback = standIn(level, here, there, searchChanged, skeletons);
	}

	// Keeps the skeleton in view: from far down a long section, a press on
	// the sticky sidebar would otherwise swap in a skeleton above the screen.
	const topRef = useRef<HTMLSpanElement>(null);
	const showing = fallback !== null;
	useLayoutEffect(() => {
		if (!showing || level === "lists") return;
		const top = topRef.current?.getBoundingClientRect().top ?? 0;
		if (top < 0) window.scrollTo({ top: 0, behavior: "instant" });
	}, [showing, level]);

	return (
		<>
			{showing ? (
				<>
					<span ref={topRef} className={styles.anchor} />
					{fallback}
				</>
			) : null}
			<div className={styles.slot} hidden={showing}>
				{children}
			</div>
		</>
	);
}

function standIn(
	level: "dashboard" | "lists" | "section",
	here: DashboardPlace,
	there: DashboardPlace,
	searchChanged: boolean,
	skeletons: DashboardSkeletons,
): ReactNode {
	const list = (view: "organized" | "attending") =>
		view === "organized" ? skeletons.organized : skeletons.attending;

	if (level === "dashboard") {
		if (there.area === "lists" && here.area === "event")
			return (
				<>
					{skeletons.toolbar}
					{list(there.view)}
				</>
			);
		if (
			there.area === "event" &&
			(here.area === "lists" || here.slug !== there.slug)
		)
			return <EventShellSkeleton place={there} skeletons={skeletons} />;
		return null;
	}

	if (level === "lists") {
		if (here.area !== "lists" || there.area !== "lists") return null;
		if (here.view === there.view && !searchChanged) return null;
		return list(there.view);
	}

	if (here.area !== "event" || there.area !== "event") return null;
	if (here.slug !== there.slug || here.section === there.section) return null;
	return sectionSkeleton(there.section, skeletons);
}

function sectionSkeleton(section: string, skeletons: DashboardSkeletons) {
	if (section === "overview") return skeletons.overview;
	if (section === "edit") return skeletons.edit;
	if (section === "form-builder") return skeletons.formBuilder;
	if (section === "guests") return skeletons.guests;
	return skeletons.section;
}

/**
 * An event's whole dashboard before any of it has loaded: the header's
 * skeleton, the real sidebar (it needs nothing from the server but the
 * address) with the section already chosen, and the section's skeleton.
 */
function EventShellSkeleton({
	place,
	skeletons,
}: {
	place: Extract<DashboardPlace, { area: "event" }>;
	skeletons: DashboardSkeletons;
}) {
	// Only ever drawn in the browser, after a press, so the cookie is there to
	// read and the sidebar opens at the width the layout will give it.
	const expanded = !document.cookie
		.split("; ")
		.includes(`${SIDEBAR_COOKIE}=collapsed`);
	return (
		<div className={shell.shell}>
			<div className={shell.eventHeader}>{skeletons.eventHeader}</div>
			<EventSidebar eventSlug={place.slug} defaultExpanded={expanded} />
			<div className={shell.content}>
				{sectionSkeleton(place.section, skeletons)}
			</div>
		</div>
	);
}
