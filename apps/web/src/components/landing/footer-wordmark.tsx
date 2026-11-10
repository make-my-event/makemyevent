import type { JSX } from "react";

/** Oversized, decorative "makemyevent" at the foot of the landing page. */
export function FooterWordmark(): JSX.Element {
	return (
		<div
			aria-hidden="true"
			translate="no"
			className="mt-8 overflow-hidden text-center font-display text-wordmark font-semibold font-stretch-wide whitespace-nowrap text-ink/15 select-none"
		>
			makemyevent
		</div>
	);
}
