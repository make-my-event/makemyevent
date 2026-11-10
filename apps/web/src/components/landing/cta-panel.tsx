import Link from "next/link";
import type { JSX } from "react";
import { pillButtonClass } from "./pill-button";

/**
 * Closing call to action, drawn as another ticket: ink panel, dashed inner
 * perforation and two paper notches on the sides.
 */
export function CtaPanel(): JSX.Element {
	return (
		<section aria-labelledby="cta-title" className="pb-16 lg:pb-24">
			<div className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">
				<div className="relative grid justify-items-center gap-6 rounded-panel bg-ink px-6 py-12 text-center text-paper outline-2 -outline-offset-16 outline-paper/25 outline-dashed before:absolute before:top-1/2 before:-left-4 before:size-8 before:-translate-y-1/2 before:rounded-full before:bg-paper after:absolute after:top-1/2 after:-right-4 after:size-8 after:-translate-y-1/2 after:rounded-full after:bg-paper md:px-12 md:py-24">
					{/* 12ch keeps the headline on two short lines, as in the spec. */}
					<h2
						id="cta-title"
						className="max-w-[12ch] font-display text-section font-semibold font-stretch-wide text-balance"
					>
						Host your first event
					</h2>
					<p className="text-paper/70">Free and open source.</p>
					<div className="flex flex-wrap justify-center gap-3">
						<Link href="/login" className={pillButtonClass("inverse")}>
							Host an event
						</Link>
						<Link
							href="/events"
							className={pillButtonClass("secondary-on-ink")}
						>
							Browse events
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
