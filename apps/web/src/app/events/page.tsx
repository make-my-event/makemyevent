"use client";

import {
	EventsFilterDialog,
	type FilterState,
} from "@/components/events/events-filter-dialog";
import {
	type EventItem,
	EventsGridView,
} from "@/components/events/events-grid-view";
import { EventsTimelineView } from "@/components/events/events-timeline-view";
import {
	EventsToolbar,
	type ViewMode,
} from "@/components/events/events-toolbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { trpc } from "@/lib/trpc";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import type { JSX } from "react";

interface ActiveFilterChip {
	key: string;
	label: string;
	onRemove: () => void;
}

export default function EventsPage(): JSX.Element {
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [viewMode, setViewMode] = useState<ViewMode>("grid");
	const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
	const [filters, setFilters] = useState<FilterState>({
		format: "All",
		location: "All",
		pricing: "all",
	});

	const {
		data: rawEvents,
		isLoading,
		isError,
		refetch,
		isRefetching,
	} = trpc.events.list.useQuery();

	const events: EventItem[] = useMemo(() => {
		if (!rawEvents) return [];
		return rawEvents as unknown as EventItem[];
	}, [rawEvents]);

	// Extract unique categories & locations
	const availableFormats = useMemo(() => {
		const fmts = new Set<string>();
		for (const ev of events) {
			if (ev.format) fmts.add(ev.format);
		}
		return Array.from(fmts);
	}, [events]);

	const availableLocations = useMemo(() => {
		const locs = new Set<string>();
		for (const ev of events) {
			if (ev.location) locs.add(ev.location);
		}
		return Array.from(locs);
	}, [events]);

	// Filter and search parsing logic
	const filteredEvents = useMemo(() => {
		return events.filter((event) => {
			// Parse search query tokens
			const query = searchQuery.trim().toLowerCase();
			let matchesSearch = true;

			if (query) {
				const tokens = query.split(/\s+/);
				for (const token of tokens) {
					if (token.startsWith("event:")) {
						const catVal = token.replace("event:", "");
						if (!event.format.toLowerCase().includes(catVal)) {
							matchesSearch = false;
						}
					} else if (token.startsWith("location:")) {
						const locVal = token.replace("location:", "");
						if (!(event.location ?? "").toLowerCase().includes(locVal)) {
							matchesSearch = false;
						}
					} else if (token.startsWith("date:")) {
						const dateVal = token.replace("date:", "");
						const evDate = new Date(event.eventStart).toISOString().slice(0, 7); // YYYY-MM
						if (!evDate.startsWith(dateVal)) {
							matchesSearch = false;
						}
					} else {
						// Free-text query across title, description, location, organizer
						const text =
							`${event.title} ${event.description ?? ""} ${event.location ?? ""} ${event.organizer.name} ${event.format} ${event.topic}`.toLowerCase();
						if (!text.includes(token)) {
							matchesSearch = false;
						}
					}
				}
			}

			if (!matchesSearch) return false;

			// Dialog Filters
			if (filters.format !== "All" && event.format !== filters.format) {
				return false;
			}
			if (filters.location !== "All" && event.location !== filters.location) {
				return false;
			}
			if (filters.pricing !== "all") {
				// An event counts as free if any tier is free (or it has none).
				const isFree =
					event.tickets.length === 0 ||
					event.tickets.some((ticket) => ticket.price === 0);
				if (filters.pricing === "free" && !isFree) return false;
				if (filters.pricing === "paid" && isFree) return false;
			}

			return true;
		});
	}, [events, searchQuery, filters]);

	const activeFilterCount = useMemo(() => {
		let count = 0;
		if (filters.format !== "All") count++;
		if (filters.location !== "All") count++;
		if (filters.pricing !== "all") count++;
		return count;
	}, [filters]);

	const resetFilters = (): void =>
		setFilters({ format: "All", location: "All", pricing: "all" });

	const activeChips: ActiveFilterChip[] = [];
	const trimmedQuery = searchQuery.trim();
	if (trimmedQuery) {
		activeChips.push({
			key: "query",
			label: `Search: “${trimmedQuery}”`,
			onRemove: () => setSearchQuery(""),
		});
	}
	if (filters.format !== "All") {
		activeChips.push({
			key: "format",
			label: `Format: ${filters.format}`,
			onRemove: () => setFilters({ ...filters, format: "All" }),
		});
	}
	if (filters.location !== "All") {
		activeChips.push({
			key: "location",
			label: `Location: ${filters.location}`,
			onRemove: () => setFilters({ ...filters, location: "All" }),
		});
	}
	if (filters.pricing !== "all") {
		activeChips.push({
			key: "pricing",
			label: `Pricing: ${filters.pricing}`,
			onRemove: () => setFilters({ ...filters, pricing: "all" }),
		});
	}

	return (
		<div className="flex min-h-dvh flex-col bg-paper">
			<SiteHeader activeNav="events" />

			<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-12 md:px-6 md:py-16 lg:px-8">
				<div className="flex flex-col gap-2">
					<h1 className="text-balance font-display text-h1 font-semibold text-ink">
						Events Directory
					</h1>
					<p className="max-w-prose text-pretty text-body text-ink/70">
						Explore upcoming conferences, hackathons, workshops, and community
						meetups.
					</p>
				</div>

				<EventsToolbar
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					viewMode={viewMode}
					onViewModeChange={setViewMode}
					onOpenFilter={() => setIsFilterOpen(true)}
					activeFilterCount={activeFilterCount}
				/>

				{activeChips.length > 0 && (
					<div className="flex flex-wrap items-center gap-2">
						<span className="label text-ink/70">Active filters</span>
						{activeChips.map((chip) => (
							<button
								key={chip.key}
								type="button"
								onClick={chip.onRemove}
								aria-label={`Remove filter ${chip.label}`}
								className="inline-flex h-11 min-w-0 max-w-full items-center gap-2 rounded-md border border-ink/50 px-4 font-mono text-sm text-ink transition-colors duration-150 hover:border-ink hover:bg-perforation/20"
							>
								<span className="truncate">{chip.label}</span>
								<X
									width={16}
									height={16}
									className="shrink-0"
									aria-hidden="true"
								/>
							</button>
						))}
						<button
							type="button"
							onClick={() => {
								setSearchQuery("");
								resetFilters();
							}}
							className="label inline-flex h-11 items-center rounded-md px-4 text-alert transition-colors duration-150 hover:bg-alert/10"
						>
							Clear all
						</button>
					</div>
				)}

				{/* Loading State */}
				{isLoading && (
					<div role="status">
						<span className="sr-only">Loading events…</span>
						<div
							aria-hidden="true"
							className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3"
						>
							{[1, 2, 3, 4, 5, 6].map((i) => (
								<div
									key={i}
									className="overflow-hidden rounded-md border border-perforation bg-paper motion-safe:animate-pulse"
								>
									<div className="aspect-video bg-perforation/40" />
									<div className="flex flex-col gap-2 p-4 md:p-6">
										<div className="h-3 w-16 rounded-sm bg-perforation/60" />
										<div className="h-5 w-3/4 rounded-sm bg-perforation/60" />
										<div className="h-3 w-24 rounded-sm bg-perforation/60" />
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Error State */}
				{isError && (
					<div className="flex flex-col items-center gap-6 rounded-md border border-perforation bg-paper px-4 py-16 text-center md:py-24">
						<div className="flex max-w-prose flex-col gap-2">
							<h2 className="font-display text-h3 font-medium text-ink">
								We couldn’t load events
							</h2>
							<p className="text-pretty text-body text-ink/70">
								Something went wrong on our side. Check your connection and try
								again.
							</p>
						</div>
						<button
							type="button"
							onClick={() => refetch()}
							disabled={isRefetching}
							className="label inline-flex h-11 w-full items-center justify-center rounded-md bg-stamp px-6 text-paper transition-opacity duration-150 hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
						>
							{isRefetching ? "Retrying…" : "Try Again"}
						</button>
					</div>
				)}

				{/* Loaded Views */}
				{!isLoading &&
					!isError &&
					(viewMode === "grid" ? (
						<EventsGridView events={filteredEvents} />
					) : (
						<EventsTimelineView events={filteredEvents} />
					))}
			</main>

			{/* Filter Dialog */}
			<EventsFilterDialog
				isOpen={isFilterOpen}
				onClose={() => setIsFilterOpen(false)}
				filters={filters}
				onFilterChange={setFilters}
				onReset={resetFilters}
				availableFormats={availableFormats}
				availableLocations={availableLocations}
			/>

			<SiteFooter />
		</div>
	);
}
