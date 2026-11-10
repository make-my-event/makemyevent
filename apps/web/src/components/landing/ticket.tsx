import type { JSX } from "react";
import { QrPlaceholder } from "./qr-placeholder";
import { TicketTilt } from "./ticket-tilt";

interface TicketField {
	label: string;
	value: string;
}

const FIELDS: TicketField[] = [
	{ label: "Date", value: "Sun 14 Mar 2027" },
	{ label: "Time", value: "10:00 to 16:00" },
	{ label: "Venue", value: "Community hall" },
];

// Ticket labels on the ink background: paper at 70%, as in the spec.
const LABEL = "label text-paper/70";

/**
 * Sample landscape ticket for the hero. Rises in on load, gets a
 * "Confirmed" stamp, and tilts toward a fine pointer (TicketTilt).
 */
export function Ticket(): JSX.Element {
	return (
		<TicketTilt className="mt-12 animate-ticket-rise perspective-distant motion-reduce:animate-none lg:mt-16">
			<figure
				aria-label="Sample event ticket"
				className="relative m-0 grid rounded-ticket bg-ink text-left text-paper transition-transform duration-250 ease-out will-change-transform motion-reduce:transition-none md:grid-cols-[minmax(0,1fr)_--spacing(70)]"
			>
				<div className="relative grid content-between gap-6 rounded-t-ticket p-6 md:min-h-70 md:rounded-l-ticket md:rounded-tr-none md:p-8">
					<p className={LABEL}>Admit one</p>
					<p className="font-display text-ticket-title font-semibold font-stretch-wide text-balance">
						Open Source Meetup
					</p>
					<dl className="flex flex-wrap gap-x-8 gap-y-4">
						{FIELDS.map((field) => (
							<div key={field.label} className="flex flex-col gap-1">
								<dt className={LABEL}>{field.label}</dt>
								<dd className="font-mono text-sm leading-snug font-medium">
									{field.value}
								</dd>
							</div>
						))}
					</dl>
					<span
						aria-hidden="true"
						className="absolute top-6 right-6 -rotate-8 animate-stamp-in rounded-sm border-2 border-paper px-3 py-1 font-display text-base leading-tight font-semibold motion-reduce:animate-none md:top-8 md:right-8"
					>
						Confirmed
					</span>
				</div>

				{/* Stub: below the main part on phones, to the right from md.
				    The two paper circles are the tear-off notches. */}
				<div className="relative grid content-center justify-items-center gap-3 rounded-b-ticket border-t-2 border-dashed border-paper/45 bg-stamp p-6 text-paper before:absolute before:-top-3 before:-left-3 before:size-6 before:rounded-full before:bg-paper after:absolute after:-top-3 after:-right-3 after:size-6 after:rounded-full after:bg-paper md:rounded-l-none md:rounded-r-ticket md:border-t-0 md:border-l-2 md:after:top-auto md:after:right-auto md:after:-bottom-3 md:after:-left-3">
					<QrPlaceholder seed={7} className="size-30 md:size-40" />
					<p className="font-mono text-sm leading-tight font-medium">
						MME-0427
					</p>
				</div>
			</figure>
		</TicketTilt>
	);
}
