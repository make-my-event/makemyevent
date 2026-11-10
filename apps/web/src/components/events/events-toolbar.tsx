"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

export type ViewMode = "grid" | "timeline";

export interface EventsToolbarProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	onOpenFilter: () => void;
	activeFilterCount: number;
}

export function EventsToolbar({
	searchQuery,
	onSearchChange,
	viewMode,
	onViewModeChange,
	onOpenFilter,
	activeFilterCount,
}: EventsToolbarProps): JSX.Element {
	const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
	const helpRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
				setIsHelpOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div className="flex flex-col items-stretch justify-between gap-4 border-b border-perforation pb-4 lg:flex-row lg:items-center">
			{/* Left: Search input with syntax support & Help button */}
			<div className="flex max-w-xl flex-1 items-center gap-2">
				<div className="relative flex min-w-0 flex-1 items-center">
					<input
						type="search"
						aria-label="Search events"
						autoComplete="off"
						spellCheck={false}
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search… event:workshop, location:kochi"
						className="h-11 w-full rounded-md border border-ink/50 bg-paper pr-12 pl-4 text-base text-ink transition-colors duration-150 placeholder:text-ink/50 focus-visible:border-stamp"
					/>
					<div className="pointer-events-none absolute right-4 text-ink/50">
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="11" cy="11" r="8" />
							<path d="m21 21-4.3-4.3" />
						</svg>
					</div>
				</div>

				{/* Query Syntax Help Tooltip Toggle */}
				<div className="relative" ref={helpRef}>
					<button
						type="button"
						onClick={() => setIsHelpOpen((open) => !open)}
						aria-label="Search syntax help"
						aria-expanded={isHelpOpen}
						className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-ink/50 text-ink/70 transition-colors duration-150 hover:bg-perforation/20 hover:text-ink"
					>
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
							<path d="M12 17h.01" />
						</svg>
					</button>

					{isHelpOpen && (
						<div className="absolute right-0 top-full z-20 mt-2 flex w-72 flex-col gap-2 rounded-md border border-perforation bg-paper p-4 text-sm shadow-lg sm:left-0 sm:right-auto">
							<div className="font-display font-medium text-ink">
								Search Syntax Guide
							</div>
							<p className="text-ink/70">You can use filter tags in search:</p>
							<ul className="flex flex-col gap-1 font-mono text-sm">
								<li>
									<span className="text-stamp">event:workshop</span> or{" "}
									<span className="text-stamp">event:fest</span>
								</li>
								<li>
									<span className="text-stamp">location:kochi</span>
								</li>
								<li>
									<span className="text-stamp">date:2026-09</span> (YYYY-MM)
								</li>
							</ul>
						</div>
					)}
				</div>
			</div>

			{/* Right: Actions (View Toggle, Filter) */}
			<div className="flex flex-wrap items-center gap-2">
				{/* RSS and calendar-subscription controls were removed until the
				    feed endpoints exist (/api/events/feed, /api/events/calendar.ics);
				    re-add them together with those routes. */}

				{/* Segmented View Toggle: Grid vs Timeline */}
				<div className="flex items-center overflow-hidden rounded-md border border-ink/50">
					<button
						type="button"
						onClick={() => onViewModeChange("grid")}
						aria-pressed={viewMode === "grid"}
						aria-label="Grid view"
						className={`inline-flex h-11 w-11 items-center justify-center transition-colors duration-150 ${
							viewMode === "grid"
								? "bg-ink text-paper"
								: "text-ink/70 hover:bg-perforation/20 hover:text-ink"
						}`}
					>
						{/* Grid Icon */}
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect width="7" height="7" x="3" y="3" rx="1" />
							<rect width="7" height="7" x="14" y="3" rx="1" />
							<rect width="7" height="7" x="14" y="14" rx="1" />
							<rect width="7" height="7" x="3" y="14" rx="1" />
						</svg>
					</button>

					<button
						type="button"
						onClick={() => onViewModeChange("timeline")}
						aria-pressed={viewMode === "timeline"}
						aria-label="Timeline view"
						className={`inline-flex h-11 w-11 items-center justify-center transition-colors duration-150 ${
							viewMode === "timeline"
								? "bg-ink text-paper"
								: "text-ink/70 hover:bg-perforation/20 hover:text-ink"
						}`}
					>
						{/* Timeline / List Icon */}
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="8" x2="21" y1="6" y2="6" />
							<line x1="8" x2="21" y1="12" y2="12" />
							<line x1="8" x2="21" y1="18" y2="18" />
							<line x1="3" x2="3.01" y1="6" y2="6" />
							<line x1="3" x2="3.01" y1="12" y2="12" />
							<line x1="3" x2="3.01" y1="18" y2="18" />
						</svg>
					</button>
				</div>

				{/* Filter Button */}
				<button
					type="button"
					onClick={onOpenFilter}
					className={`label flex h-11 items-center gap-2 rounded-md border px-4 transition-colors duration-150 ${
						activeFilterCount > 0
							? "border-stamp bg-stamp/5 text-stamp"
							: "border-ink/50 text-ink hover:bg-perforation/20"
					}`}
				>
					<span>Filter</span>
					<svg
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="4" x2="4" y1="21" y2="14" />
						<line x1="4" x2="4" y1="10" y2="3" />
						<line x1="12" x2="12" y1="21" y2="12" />
						<line x1="12" x2="12" y1="8" y2="3" />
						<line x1="20" x2="20" y1="21" y2="16" />
						<line x1="20" x2="20" y1="12" y2="3" />
						<line x1="1" x2="7" y1="14" y2="14" />
						<line x1="9" x2="15" y1="8" y2="8" />
						<line x1="17" x2="23" y1="16" y2="16" />
					</svg>
					{activeFilterCount > 0 && (
						<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-stamp px-1 font-mono text-xs text-paper tabular-nums">
							{activeFilterCount}
							<span className="sr-only"> active</span>
						</span>
					)}
				</button>
			</div>
		</div>
	);
}
