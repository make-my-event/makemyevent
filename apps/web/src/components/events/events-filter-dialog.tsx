"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { JSX } from "react";

export interface FilterState {
	format: string;
	location: string;
	pricing: string; // "all" | "free" | "paid"
}

export interface EventsFilterDialogProps {
	isOpen: boolean;
	onClose: () => void;
	filters: FilterState;
	onFilterChange: (filters: FilterState) => void;
	onReset: () => void;
	availableFormats: string[];
	availableLocations: string[];
}

const selectClass =
	"h-11 w-full rounded-md border border-ink/50 bg-paper px-4 text-base text-ink transition-colors duration-150 focus-visible:border-stamp";

export function EventsFilterDialog({
	isOpen,
	onClose,
	filters,
	onFilterChange,
	onReset,
	availableFormats,
	availableLocations,
}: EventsFilterDialogProps): JSX.Element | null {
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	// Callers often pass an inline arrow; keep the latest one in a ref so the
	// effect below runs only on open/close, not on every filter change.
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	// Move focus into the dialog on open, close on Escape, and return focus to
	// whatever opened it when it closes.
	useEffect(() => {
		if (!isOpen) return;
		const previouslyFocused = document.activeElement;
		closeButtonRef.current?.focus();

		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === "Escape") onCloseRef.current();
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="filter-title"
			className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
		>
			{/* Backdrop: pointer dismissal only; keyboard users have Escape and
			    the close button. */}
			<button
				type="button"
				aria-label="Close filter overlay"
				onClick={onClose}
				className="fixed inset-0 -z-10 h-full w-full cursor-default bg-transparent"
				tabIndex={-1}
			/>

			<div className="relative flex max-h-full w-full max-w-md flex-col gap-6 overflow-y-auto overscroll-contain rounded-lg border border-perforation bg-paper p-6 shadow-xl">
				<div className="flex items-center justify-between gap-4 border-b border-perforation pb-4">
					<h2
						id="filter-title"
						className="font-display text-h3 font-semibold text-ink"
					>
						Filter Events
					</h2>
					<button
						ref={closeButtonRef}
						type="button"
						onClick={onClose}
						aria-label="Close filters"
						className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink/70 transition-colors duration-150 hover:bg-perforation/20 hover:text-ink"
					>
						<X width={18} height={18} aria-hidden="true" />
					</button>
				</div>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="format-select" className="label">
							Event Format
						</label>
						<select
							id="format-select"
							value={filters.format}
							onChange={(e) =>
								onFilterChange({ ...filters, format: e.target.value })
							}
							className={selectClass}
						>
							<option value="All">All Formats</option>
							{availableFormats.map((fmt) => (
								<option key={fmt} value={fmt}>
									{fmt}
								</option>
							))}
						</select>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="location-select" className="label">
							Location
						</label>
						<select
							id="location-select"
							value={filters.location}
							onChange={(e) =>
								onFilterChange({ ...filters, location: e.target.value })
							}
							className={selectClass}
						>
							<option value="All">All Locations</option>
							{availableLocations.map((loc) => (
								<option key={loc} value={loc}>
									{loc}
								</option>
							))}
						</select>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="pricing-select" className="label">
							Pricing
						</label>
						<select
							id="pricing-select"
							value={filters.pricing}
							onChange={(e) =>
								onFilterChange({ ...filters, pricing: e.target.value })
							}
							className={selectClass}
						>
							<option value="all">All Events (Free & Paid)</option>
							<option value="free">Free Only</option>
							<option value="paid">Paid Only</option>
						</select>
					</div>
				</div>

				<div className="flex flex-col-reverse gap-2 border-t border-perforation pt-4 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onClick={onReset}
						className="label inline-flex h-11 items-center justify-center rounded-md px-4 text-ink/70 transition-colors duration-150 hover:bg-perforation/20 hover:text-ink"
					>
						Reset All
					</button>
					<button
						type="button"
						onClick={onClose}
						className="label inline-flex h-11 w-full items-center justify-center rounded-md bg-stamp px-6 text-paper transition-opacity duration-150 hover:opacity-90 active:opacity-80 sm:w-auto"
					>
						Apply Filters
					</button>
				</div>
			</div>
		</div>
	);
}
