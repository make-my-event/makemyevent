"use client";

import Link from "next/link";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { placeOf, usePendingNav } from "./pending-nav-context";
import { parseQuery, viewFromSegment, viewHref } from "./types";
import styles from "./toolbar.module.css";

/**
 * Organized / Attending: two links to two routes.
 *
 * It sits in the dashboard layout, so it stays mounted while someone moves
 * between them, and reads which one is open from the route segment rather
 * than from a prop — a layout's props do not change on a move between its
 * pages.
 *
 * next/link makes the move a soft navigation: only the list below is
 * fetched and swapped, and the document is never torn down.
 *
 * The thumb is optimistic. The segment does not change until the new list
 * has arrived, so the thumb follows the move in progress (see PendingNav)
 * and the route takes over when it lands. Under prefers-reduced-motion it
 * jumps: globals.css drops every transition, and this one needs no
 * exception.
 */
export function ViewTabs() {
	const view = viewFromSegment(useSelectedLayoutSegment());
	const query = parseQuery(useSearchParams().get("q"));
	const { target } = usePendingNav();
	const going = target ? placeOf(target.pathname) : null;
	const shown = going?.area === "lists" ? going.view : view;

	return (
		<nav className={styles.views} aria-label="Events to show">
			<span className={styles.viewThumb} data-view={shown} aria-hidden="true" />
			{(["organized", "attending"] as const).map((value) => (
				<Link
					key={value}
					className={`${styles.view} ${shown === value ? styles.viewCurrent : ""}`}
					href={viewHref(value, query)}
					aria-current={shown === value ? "page" : undefined}
				>
					{value === "organized" ? "Organized" : "Attending"}
				</Link>
			))}
		</nav>
	);
}
