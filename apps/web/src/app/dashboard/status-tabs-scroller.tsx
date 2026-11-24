"use client";

import { useEffect, useRef } from "react";

/**
 * The status filters' row. On a phone it is a strip of chips that scrolls
 * sideways; this keeps the chosen one in view, so choosing "Completed" never
 * leaves it scrolled off the edge. Everywhere else it is the plain row and
 * this does nothing visible.
 */
export function StatusTabsScroller({
	className,
	current,
	children,
}: {
	className: string | undefined;
	/** The chosen filter, so the row re-centres when it changes. */
	current: string;
	children: React.ReactNode;
}) {
	const ref = useRef<HTMLElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-centres on purpose whenever the chosen filter changes
	useEffect(() => {
		const row = ref.current;
		const chosen = row?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!row || !chosen || row.scrollWidth <= row.clientWidth) return;
		// Within the row only: the page itself must not jump.
		row.scrollTo({
			left: chosen.offsetLeft - (row.clientWidth - chosen.offsetWidth) / 2,
			behavior: "instant",
		});
	}, [current]);

	return (
		<nav ref={ref} className={className} aria-label="Filter by status">
			{children}
		</nav>
	);
}
