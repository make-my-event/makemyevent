import { FooterWordmark } from "@/components/landing/footer-wordmark";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import type { JSX } from "react";

const REPO_URL = "https://github.com/make-my-event/makemyevent";

export interface SiteFooterProps {
	/** "landing": the marketing page footer with the large wordmark. */
	variant?: "app" | "landing";
}

export function SiteFooter({
	variant = "app",
}: SiteFooterProps = {}): JSX.Element {
	return variant === "landing" ? <LandingFooter /> : <AppFooter />;
}

const LANDING_LINKS = [
	{ label: "GitHub", href: REPO_URL },
	{
		label: "Contributing",
		href: `${REPO_URL}/blob/development/CONTRIBUTING.md`,
	},
	{ label: "Security", href: `${REPO_URL}/security` },
	{ label: "License", href: `${REPO_URL}/blob/development/LICENSE.txt` },
];

function LandingFooter(): JSX.Element {
	return (
		<footer className="overflow-hidden pt-8">
			<div className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">
				<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
					<Link
						href="/"
						aria-label="makemyevent home"
						className="inline-flex min-h-11 items-center gap-2 font-display text-xl leading-none font-semibold tracking-tight no-underline"
					>
						<Logo width={22} height={24} className="h-6 w-auto" />
						<span translate="no">makemyevent</span>
					</Link>
					<nav aria-label="Footer" className="flex flex-wrap gap-x-4">
						{LANDING_LINKS.map((link) => (
							<a
								key={link.label}
								href={link.href}
								className="inline-flex min-h-11 items-center underline underline-offset-4"
							>
								{link.label}
							</a>
						))}
					</nav>
					<p className="text-sm text-ink/70">
						© {new Date().getFullYear()} <span translate="no">makemyevent</span>
					</p>
				</div>
				<FooterWordmark />
			</div>
		</footer>
	);
}

function AppFooter(): JSX.Element {
	return (
		<footer className="border-t border-perforation bg-paper py-12 text-ink">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 md:px-6 lg:px-8">
				<div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
					{/* Left: Brand Identity */}
					<div className="flex max-w-md flex-col gap-2">
						<Link
							href="/"
							aria-label="makemyevent home"
							className="flex min-h-11 items-center gap-2 self-start rounded-md font-display text-h3 font-semibold tracking-tight"
						>
							<Logo width={32} height={32} className="h-8 w-8 object-contain" />
							<span translate="no">makemyevent</span>
						</Link>
						<p className="text-pretty text-sm leading-relaxed text-ink/70">
							Open-source event ticketing and community management platform.
							Built for organizers, meetups, and conferences.
						</p>
					</div>

					{/* Right: Quick Links + GitHub Button */}
					<nav
						aria-label="Footer"
						className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium"
					>
						<Link
							href="/events"
							className="inline-flex h-11 items-center text-ink/70 transition-colors duration-150 hover:text-ink"
						>
							Explore Events
						</Link>
						<Link
							href="/dashboard"
							className="inline-flex h-11 items-center text-ink/70 transition-colors duration-150 hover:text-ink"
						>
							Dashboard
						</Link>
						<a
							href="mailto:admin@makemyevent.org"
							className="inline-flex h-11 items-center text-ink/70 transition-colors duration-150 hover:text-ink"
						>
							Contact
						</a>

						{/* GitHub Link */}
						<a
							href="https://github.com/make-my-event/makemyevent"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex h-11 items-center gap-2 rounded-md border border-ink/50 px-4 font-mono text-sm text-ink transition-colors duration-150 hover:border-ink hover:bg-perforation/20"
						>
							<svg
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
								<path d="M9 18c-4.51 2-5-2-7-2" />
							</svg>
							<span>GitHub Repository</span>
							<span className="sr-only"> (opens in a new tab)</span>
						</a>
					</nav>
				</div>

				{/* Bottom copyright line */}
				<div className="border-t border-perforation pt-6 font-mono text-sm text-ink/70">
					<p>
						© {new Date().getFullYear()} <span translate="no">makemyevent</span>
						. Open Source.
					</p>
				</div>
			</div>
		</footer>
	);
}
