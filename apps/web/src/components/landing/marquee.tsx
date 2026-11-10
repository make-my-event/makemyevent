import { Ticket } from "lucide-react";
import { Fragment } from "react";
import type { JSX } from "react";

const EVENT_TYPES = [
	"Meetups",
	"Hackathons",
	"Workshops",
	"Conferences",
	"Bootcamps",
	"Demo days",
];

interface MarqueeGroupProps {
	/** The second copy only exists to make the loop seamless. */
	isDuplicate: boolean;
}

function MarqueeGroup({ isDuplicate }: MarqueeGroupProps): JSX.Element {
	return (
		<div
			aria-hidden={isDuplicate ? "true" : undefined}
			className={`flex shrink-0 items-center gap-8 pr-8 motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:px-4 ${
				isDuplicate ? "motion-reduce:hidden" : ""
			}`}
		>
			{EVENT_TYPES.map((type) => (
				<Fragment key={type}>
					<span className="font-display text-marquee font-medium font-stretch-wide whitespace-nowrap">
						{type}
					</span>
					<Ticket aria-hidden="true" className="size-6 shrink-0 text-ink/50" />
				</Fragment>
			))}
		</div>
	);
}

/**
 * Endless strip of event types. With reduced motion it stops and wraps as
 * a static, centered list.
 */
export function Marquee(): JSX.Element {
	return (
		// A labelled group (spec: aria-label "Event types"). Biome suggests
		// <fieldset>, which is for form controls, so the role stays.
		// biome-ignore lint/a11y/useSemanticElements: not a form; see above
		<div
			role="group"
			aria-label="Event types"
			className="marquee-mask overflow-hidden border-y border-perforation py-6"
		>
			<div className="flex w-max animate-marquee motion-reduce:w-auto motion-reduce:animate-none">
				<MarqueeGroup isDuplicate={false} />
				<MarqueeGroup isDuplicate />
			</div>
		</div>
	);
}
