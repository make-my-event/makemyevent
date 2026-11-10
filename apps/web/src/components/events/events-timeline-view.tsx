"use client";

import { EventsEmptyState } from "@/components/events/events-empty-state";
import { getCardPriceLabel } from "@/lib/event-format";
import { Clock, MapPin } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";
import type { EventItem } from "./events-grid-view";

export interface EventsTimelineViewProps {
	events: EventItem[];
}

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
	month: "long",
	year: "numeric",
});
const weekdayFormatter = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("en-IN", {
	hour: "numeric",
	minute: "2-digit",
	hour12: true,
});

export function EventsTimelineView({
	events,
}: EventsTimelineViewProps): JSX.Element {
	if (events.length === 0) {
		return <EventsEmptyState />;
	}

	// Group events by month and year
	const groupedEvents: Record<string, EventItem[]> = {};
	for (const event of events) {
		const monthYear = monthFormatter.format(new Date(event.eventStart));
		if (!groupedEvents[monthYear]) {
			groupedEvents[monthYear] = [];
		}
		groupedEvents[monthYear].push(event);
	}

	return (
		<div className="flex flex-col gap-12">
			{Object.entries(groupedEvents).map(([monthYear, monthEvents]) => (
				<section key={monthYear} className="flex flex-col gap-6">
					<div className="flex items-center gap-4">
						<h2 className="font-display text-h2 font-semibold text-ink">
							{monthYear}
						</h2>
						<div
							aria-hidden="true"
							className="flex-1 border-b border-perforation"
						/>
						<span className="label font-mono tabular-nums text-ink/70">
							{monthEvents.length}{" "}
							{monthEvents.length === 1 ? "event" : "events"}
						</span>
					</div>

					{/* Timeline rail */}
					<ul className="ml-3 flex flex-col gap-8 border-l border-perforation pl-6 md:ml-4 md:pl-8">
						{monthEvents.map((event) => {
							const eventDate = new Date(event.eventStart);
							const price = getCardPriceLabel(event.tickets);
							const href = `/events/${event.slug}`;
							const location =
								event.location ||
								(event.isOnline ? "Online" : "Location to be announced");

							return (
								<li key={event.id} className="group relative">
									{/* Timeline dot */}
									<div
										aria-hidden="true"
										className="absolute top-6 -left-6 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-stamp bg-paper transition-transform duration-150 motion-safe:group-hover:scale-125 md:-left-8"
									/>

									<article className="flex flex-col items-start justify-between gap-6 rounded-md border border-perforation bg-paper p-4 transition-colors duration-150 hover:border-stamp/40 md:flex-row md:items-center md:p-6">
										<div className="flex min-w-0 items-start gap-4">
											<time
												dateTime={eventDate.toISOString()}
												className="flex min-w-16 flex-col items-center justify-center rounded-md border border-perforation bg-perforation/20 p-3 text-center"
											>
												<span className="label text-stamp">
													{weekdayFormatter.format(eventDate)}
												</span>
												<span className="font-display text-2xl font-semibold leading-tight text-ink tabular-nums">
													{eventDate.getDate()}
												</span>
											</time>

											<div className="flex min-w-0 flex-col gap-2">
												<div className="flex flex-wrap items-center gap-2">
													<span className="label max-w-full truncate rounded-sm border border-perforation bg-paper px-2 py-1">
														{event.organizer.name}
													</span>
													<span className="label text-stamp">
														{event.format}
													</span>
													{event.isOnline && (
														<span className="label text-ink/70">Online</span>
													)}
												</div>

												<h3 className="break-words font-display text-h3 font-medium text-ink">
													<Link href={href} className="hover:underline">
														{event.title}
													</Link>
												</h3>

												{event.description && (
													<p className="line-clamp-2 max-w-prose text-sm text-ink/70">
														{event.description}
													</p>
												)}

												<div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-ink/70">
													<span className="flex items-center gap-1 tabular-nums">
														<Clock
															className="h-4 w-4 shrink-0 text-stamp"
															aria-hidden="true"
														/>
														{timeFormatter.format(eventDate)}
													</span>
													<span className="flex min-w-0 items-center gap-1">
														<MapPin
															className="h-4 w-4 shrink-0 text-stamp"
															aria-hidden="true"
														/>
														<span className="truncate">{location}</span>
													</span>
												</div>
											</div>
										</div>

										<div className="flex w-full items-center justify-between gap-4 border-t border-perforation pt-4 md:w-auto md:justify-end md:border-t-0 md:pt-0">
											<div className="text-right">
												<div className="label text-ink/70">Price</div>
												<div className="font-mono text-ticket font-medium tabular-nums text-ink">
													{price ?? "See details"}
												</div>
											</div>

											<Link
												href={href}
												aria-label={`Register for ${event.title}`}
												className="label inline-flex h-11 items-center whitespace-nowrap rounded-md bg-stamp px-4 text-paper transition-opacity duration-150 hover:opacity-90 active:opacity-80"
											>
												Register
											</Link>
										</div>
									</article>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
