import { GithubIcon } from "@/components/ui/github-icon";
import { Award, Mail } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { pillButtonClass } from "./pill-button";
import { QrPlaceholder } from "./qr-placeholder";
import { RatingTile } from "./rating-tile";
import { RsvpTile } from "./rsvp-tile";
import { ScanTile } from "./scan-tile";

// Tile surface. Compact below 640px (spec v5); tall tiles add TALL.
// Feedback and Open source have no min-height.
const TILE =
	"flex flex-col justify-between gap-6 rounded-tile border border-perforation bg-ink/4 p-4 sm:gap-8 sm:p-6";
const TALL = "min-h-50 sm:min-h-60";
const VISUAL = "flex flex-wrap items-center gap-3";
/** text-lg in compact half-width tiles; rating-tile.tsx matches it. */
const TILE_TITLE =
	"font-display text-2xl leading-tight font-medium tracking-tight bento-compact:text-lg";

interface TileTextProps {
	title: string;
	/** Half-width tiles keep the subtext for screen readers only, 360-639px. */
	isCompactable?: boolean;
	children: ReactNode;
}

function TileText({
	title,
	isCompactable = false,
	children,
}: TileTextProps): JSX.Element {
	return (
		<div className="flex flex-col gap-1">
			<h3 className={TILE_TITLE}>{title}</h3>
			<p
				className={`text-ink/70 ${isCompactable ? "bento-compact:sr-only" : ""}`}
			>
				{children}
			</p>
		</div>
	);
}

export function FeaturesBento(): JSX.Element {
	return (
		<section
			id="features"
			aria-labelledby="features-title"
			className="scroll-mt-24 py-16 lg:py-24"
		>
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 md:gap-12 md:px-6 lg:px-8">
				<h2
					id="features-title"
					className="text-center font-display text-section font-semibold font-stretch-wide text-balance"
				>
					Everything an event needs
				</h2>

				{/* grid-cols-2 is minmax(0, 1fr): the two columns stay equal and never
				    move when a tile's content changes (RsvpTile narrows its
				    "Registered" pill in compact tiles to fit). */}
				<div className="grid gap-3 bento-2col:grid-cols-2 sm:gap-4 lg:grid-cols-12">
					<article className={`${TILE} ${TALL} lg:col-span-7`}>
						<div className={VISUAL}>
							<RsvpTile />
						</div>
						<TileText title="One-click RSVP" isCompactable>
							No forms.
						</TileText>
					</article>

					<article className={`${TILE} ${TALL} lg:col-span-5`}>
						<div aria-hidden="true" className={VISUAL}>
							<QrPlaceholder
								seed={21}
								className="size-24 shrink-0 text-ink bento-compact:size-18"
							/>
							<Mail className="size-8 shrink-0 bento-compact:size-6" />
						</div>
						<TileText title="QR passes" isCompactable>
							Straight to the inbox.
						</TileText>
					</article>

					<article className={`${TILE} ${TALL} lg:col-span-4`}>
						<div aria-hidden="true" className={VISUAL}>
							<div className="flex w-full max-w-55 flex-col gap-2 rounded-lg border border-ink/50 bg-paper p-4 bento-compact:p-3">
								<Award className="size-6" />
								<strong className="font-display text-base leading-tight font-medium">
									Certificate
								</strong>
								<span className="block h-1.5 rounded-full bg-ink/15" />
								<span className="block h-1.5 w-3/5 rounded-full bg-ink/15" />
							</div>
						</div>
						<TileText title="Certificates" isCompactable>
							Sent automatically.
						</TileText>
					</article>

					<article className={`${TILE} ${TALL} lg:col-span-4`}>
						<div className={VISUAL}>
							<ScanTile />
						</div>
						<TileText title="Fast check-in" isCompactable>
							Scan and go.
						</TileText>
					</article>

					<article className={`${TILE} bento-2col:col-span-2 lg:col-span-4`}>
						<RatingTile />
					</article>

					<article
						className={`${TILE} flex-row flex-wrap items-center bento-2col:col-span-2 lg:col-span-12`}
					>
						<div className="min-w-0 grow basis-60">
							<TileText title="Open source">
								AGPL-3.0. Read it, fork it, run it.
							</TileText>
						</div>
						<a
							href="https://github.com/make-my-event/makemyevent"
							className={pillButtonClass("secondary")}
						>
							<GithubIcon className="size-5" />
							View on GitHub
						</a>
					</article>
				</div>
			</div>
		</section>
	);
}
