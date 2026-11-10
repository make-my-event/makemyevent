import type { JSX } from "react";

export interface SkipLinkProps {
	/** id of the element to jump to; it must exist on the page. */
	targetId: string;
}

/**
 * First focusable element on the page. It stays visually hidden until it
 * receives keyboard focus, then lets keyboard users jump past the header.
 */
export function SkipLink({ targetId }: SkipLinkProps): JSX.Element {
	return (
		<a
			href={`#${targetId}`}
			className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-40 focus:inline-flex focus:h-11 focus:items-center focus:rounded-md focus:bg-ink focus:px-4 focus:font-medium focus:text-paper"
		>
			Skip to main content
		</a>
	);
}
