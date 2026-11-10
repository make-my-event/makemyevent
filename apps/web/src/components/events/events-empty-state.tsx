import type { JSX } from "react";

/** Shown by the grid and timeline views when no event matches. */
export function EventsEmptyState(): JSX.Element {
	return (
		<div className="flex flex-col items-center gap-2 rounded-md border border-perforation bg-paper px-4 py-16 text-center md:py-24">
			<h2 className="text-balance font-display text-h3 font-medium text-ink">
				No events found
			</h2>
			<p className="max-w-prose text-pretty text-body text-ink/70">
				Try changing your search terms or adjusting active filters to discover
				more events.
			</p>
		</div>
	);
}
