"use client";

import Form from "next/form";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { parsePhase, parseQuery, viewFromSegment } from "./types";
import styles from "./toolbar.module.css";

/**
 * Search over whichever list is open. A GET form, so a search is a URL that
 * can be gone back to; next/form makes submitting it a soft navigation, and
 * without script it is an ordinary form that still works.
 *
 * Keyed on the route and the query, so the box always shows what the list
 * below it is filtered by — including after the back button, or a "Clear
 * search" link, has changed the URL out from under it.
 */
export function DashboardSearch() {
	const view = viewFromSegment(useSelectedLayoutSegment());
	const params = useSearchParams();
	const query = parseQuery(params.get("q"));
	// A search on Organized stays inside the status tab that is open.
	const phase = view === "organized" ? parsePhase(params.get("status")) : null;

	return (
		<search className={styles.search}>
			<Form className={styles.searchForm} action={`/dashboard/${view}`}>
				<label className={styles.srOnly} htmlFor="dashboard-search">
					Search for events or codes
				</label>
				{phase ? <input type="hidden" name="status" value={phase} /> : null}
				<input
					key={`${view}:${query}`}
					className={styles.searchInput}
					id="dashboard-search"
					name="q"
					type="search"
					defaultValue={query}
					placeholder="Search for events or codes..."
					autoComplete="off"
					maxLength={120}
				/>
				<svg
					className={styles.searchIcon}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-3.5-3.5" />
				</svg>
			</Form>
		</search>
	);
}
