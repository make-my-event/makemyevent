"use client";

import { EventsEmptyState } from "@/components/events/events-empty-state";
import { getCardPriceLabel } from "@/lib/event-format";
import { CalendarDays } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { JSX } from "react";

export interface EventItem {
	id: string;
	title: string;
	slug: string;
	description?: string | null;
	format: string;
	bannerUrl?: string | null;
	topic: string;
	tags: string[];
	eventStart: string | Date;
	eventEnd: string | Date;
	location: string | null;
	isOnline: boolean;
	tickets: Array<{
		id: string;
		name: string;
		price: number;
		quantity: number | null;
	}>;
	organizer: {
		id: string;
		name: string;
		slug: string;
		type: string;
	};
}

export interface EventsGridViewProps {
	events: EventItem[];
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

export function EventsGridView({ events }: EventsGridViewProps): JSX.Element {
	if (events.length === 0) {
		return <EventsEmptyState />;
	}

	return (
		<section aria-labelledby="events-grid-heading">
			<h2 id="events-grid-heading" className="sr-only">
				Events
			</h2>
			<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
				{events.map((event) => {
					const href = `/events/${event.slug}`;
					const price = getCardPriceLabel(event.tickets);
					const location =
						event.location ||
						(event.isOnline ? "Online" : "Location to be announced");

					return (
						<li key={event.id}>
							<article className="flex h-full flex-col overflow-hidden rounded-md border border-perforation bg-paper transition-colors duration-150 hover:border-stamp/40">
								<div className="relative flex aspect-video items-end overflow-hidden border-b border-perforation bg-perforation/40 p-4">
									{event.bannerUrl && (
										<Image
											src={event.bannerUrl}
											// Decorative: the title below names the event.
											alt=""
											fill
											sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
											className="object-cover"
										/>
									)}
									<span className="label relative max-w-full truncate rounded-sm border border-perforation bg-paper/90 px-2 py-1 text-ink">
										{event.organizer.name}
									</span>
								</div>

								<div className="flex flex-1 flex-col gap-2 p-4 md:p-6">
									<div className="flex items-center justify-between gap-2">
										<span className="label text-stamp">{event.format}</span>
										{event.isOnline && (
											<span className="label text-ink/70">Online</span>
										)}
									</div>

									<h3 className="line-clamp-2 break-words font-display text-h3 font-medium text-ink">
										<Link href={href} className="hover:underline">
											{event.title}
										</Link>
									</h3>

									{event.description && (
										<p className="line-clamp-2 text-sm text-ink/70">
											{event.description}
										</p>
									)}

									<p className="flex min-w-0 items-center gap-2 font-mono text-sm text-ink/70">
										<CalendarDays
											width={16}
											height={16}
											className="shrink-0"
											aria-hidden="true"
										/>
										<span className="truncate">
											{dateFormatter.format(new Date(event.eventStart))} ·{" "}
											{location}
										</span>
									</p>
								</div>

								<div className="px-4 pb-4 md:px-6 md:pb-6">
									<div className="tear-line flex items-center justify-between gap-4 pt-4">
										<div className="flex flex-col">
											<span className="label text-ink/70">Ticket</span>
											<span className="font-mono text-ticket font-medium tabular-nums text-ink">
												{price ?? "See details"}
											</span>
										</div>
										<Link
											href={href}
											aria-label={`View event: ${event.title}`}
											className="label inline-flex h-11 items-center rounded-md bg-stamp px-4 text-paper transition-opacity duration-150 hover:opacity-90 active:opacity-80"
										>
											View Event
										</Link>
									</div>
								</div>
							</article>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
