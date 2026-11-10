import Link from "next/link";
import type { JSX } from "react";
import { pillButtonClass } from "./pill-button";
import { Ticket } from "./ticket";

export interface HeroProps {
	/** Signed-in visitors get "Open dashboard" as the primary action. */
	isSignedIn: boolean;
	dashboardHref: string;
}

// Each headline line slides up out of its own clipping box. The small
// padding/negative margin pair keeps descenders from being clipped.
const LINE = "block overflow-hidden py-[0.06em] -my-[0.06em]";
const LINE_INNER = "inline-block animate-line-up motion-reduce:animate-none";

export function Hero({ isSignedIn, dashboardHref }: HeroProps): JSX.Element {
	return (
		<section
			aria-labelledby="hero-title"
			className="pt-16 pb-12 text-center lg:pt-24 lg:pb-16"
		>
			<div className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">
				<div className="grid justify-items-center gap-6">
					<h1
						id="hero-title"
						className="max-w-[20ch] font-display text-display font-semibold font-stretch-wide text-balance"
					>
						<span className={LINE}>
							<span className={LINE_INNER}>Host the event.</span>
						</span>{" "}
						<span className={LINE}>
							<span className={`${LINE_INNER} [animation-delay:120ms]`}>
								We handle the tickets.
							</span>
						</span>
					</h1>
					<p className="max-w-sm text-lg text-balance text-ink/70">
						Free event pages, QR passes and certificates for your community.
					</p>
					<div className="flex flex-wrap justify-center gap-3">
						{isSignedIn ? (
							<Link href={dashboardHref} className={pillButtonClass("primary")}>
								Open dashboard
							</Link>
						) : (
							<Link href="/login" className={pillButtonClass("primary")}>
								Host an event
							</Link>
						)}
						<Link href="/events" className={pillButtonClass("secondary")}>
							Browse events
						</Link>
					</div>
				</div>

				<Ticket />
			</div>
		</section>
	);
}
