import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import type { JSX } from "react";

/**
 * Logo-only header for focused flows (sign-in, onboarding) where the full
 * site navigation would be a distraction. Uses the same container as
 * `SiteHeader` so the logo lines up across pages.
 */
export function MinimalHeader(): JSX.Element {
	return (
		<header className="border-b border-perforation">
			<div className="mx-auto flex w-full max-w-7xl items-center px-4 py-2 md:px-6 lg:px-8">
				<Link
					href="/"
					aria-label="makemyevent home"
					className="flex min-h-11 items-center gap-2 rounded-md font-display text-h3 font-semibold tracking-tight text-ink"
				>
					<Logo
						width={36}
						height={36}
						className="h-8 w-8 object-contain sm:h-9 sm:w-9"
						priority
					/>
					<span translate="no">makemyevent</span>
				</Link>
			</div>
		</header>
	);
}
