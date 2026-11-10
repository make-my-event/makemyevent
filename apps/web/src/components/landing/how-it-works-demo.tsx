"use client";

import { rovingIndex } from "@/lib/roving-index";
import { Award, Calendar, Check, MapPin, Star } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { JSX, KeyboardEvent } from "react";
import { pillButtonClass } from "./pill-button";
import { QrPlaceholder } from "./qr-placeholder";

/** Must match the duration in --animate-tab-fill (globals.css). */
const TAB_DURATION_MS = 5000;

interface Step {
	title: string;
	caption: string;
}

const STEPS: Step[] = [
	{ title: "Publish", caption: "Create your page" },
	{ title: "Register", caption: "Share the link" },
	{ title: "Check in", caption: "Scan passes" },
	{ title: "Certify", caption: "Send certificates" },
];

interface SceneProps {
	isActive: boolean;
}

/** Same as `motion-reduce:` but for the scenes' one-shot reveals. */
function whenActive(isActive: boolean, animation: string): string {
	return isActive ? `${animation} motion-reduce:animate-none` : "";
}

function PublishScene({ isActive }: SceneProps): JSX.Element {
	return (
		<div className="grid w-full max-w-90 gap-4 rounded-ticket border border-ink/15 bg-paper p-5">
			<div className="grid gap-1">
				<small className="text-sm text-ink/70">Event name</small>
				<div className="flex min-h-11 items-center rounded-lg border border-ink/50 px-4 font-display text-base leading-none font-medium">
					Open Source Meetup
					<i
						className={`ml-0.5 h-5 w-0.5 bg-ink ${whenActive(isActive, "animate-caret-blink")}`}
					/>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<span className="inline-flex min-h-8 items-center gap-2 rounded-pill border border-ink/15 px-3 text-sm">
					<Calendar className="size-4" />
					Sun 14 Mar
				</span>
				<span className="inline-flex min-h-8 items-center gap-2 rounded-pill border border-ink/15 px-3 text-sm">
					<MapPin className="size-4" />
					Community hall
				</span>
			</div>
			<span
				className={`${pillButtonClass("primary", "sm")} justify-self-start`}
			>
				Publish
			</span>
		</div>
	);
}

function RegisterScene({ isActive }: SceneProps): JSX.Element {
	return (
		<div className="grid w-55 justify-items-center gap-3 rounded-panel border-2 border-ink bg-paper px-4 py-6">
			<strong className="text-center font-display text-base leading-tight font-medium">
				Open Source Meetup
			</strong>
			{/* The Register button flips to Registered 1.2s into the scene. */}
			<span className="grid">
				<span
					className={`col-start-1 row-start-1 inline-flex min-h-11 items-center justify-center rounded-pill border border-stamp bg-stamp px-5 font-medium text-paper motion-reduce:hidden ${whenActive(isActive, "animate-swap-out")}`}
				>
					Register
				</span>
				<span
					className={`col-start-1 row-start-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-ink/50 px-5 font-medium opacity-0 motion-reduce:opacity-100 ${whenActive(isActive, "animate-swap-in")}`}
				>
					<Check className="size-5 text-stamp" />
					Registered
				</span>
			</span>
			<QrPlaceholder
				seed={33}
				className={`size-24 text-ink opacity-0 motion-reduce:opacity-100 ${whenActive(isActive, "animate-qr-in")}`}
			/>
		</div>
	);
}

function CheckInScene({ isActive }: SceneProps): JSX.Element {
	return (
		<div className="grid justify-items-center">
			<div className="relative grid size-50 place-items-center rounded-tile border-2 border-ink bg-paper text-ink">
				<QrPlaceholder seed={45} className="size-30" />
				<span
					className={`absolute inset-x-3 top-3 h-0.5 rounded-full bg-stamp ${whenActive(isActive, "animate-scan-sweep")}`}
				/>
			</div>
			<span className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-pill border border-ink/50 bg-paper px-4 font-medium">
				<Check className="size-5 text-stamp" />
				Asha K.
				<span className="font-mono text-sm leading-none font-medium text-ink/70">
					129/150
				</span>
			</span>
		</div>
	);
}

function CertifyScene(): JSX.Element {
	return (
		<div className="grid w-full max-w-85 justify-items-center gap-2 rounded-card border border-ink/50 bg-paper p-6 text-center">
			<Award className="size-8" />
			<span className="font-display text-lg leading-tight font-medium">
				Certificate of participation
			</span>
			<span className="font-display text-3xl leading-tight font-semibold font-stretch-wide tracking-tight">
				Asha K.
			</span>
			<span className="text-sm text-ink/70">Open Source Meetup</span>
			<span className="mt-2 flex gap-1">
				{[1, 2, 3, 4, 5].map((n) => (
					<Star key={n} fill="currentColor" className="size-5" />
				))}
			</span>
		</div>
	);
}

function Scene({
	index,
	isActive,
}: {
	index: number;
	isActive: boolean;
}): JSX.Element {
	switch (index) {
		case 0:
			return <PublishScene isActive={isActive} />;
		case 1:
			return <RegisterScene isActive={isActive} />;
		case 2:
			return <CheckInScene isActive={isActive} />;
		default:
			return <CertifyScene />;
	}
}

/**
 * "How it works" tabs with a live product demo. Auto-advances every 5s while
 * the demo is on screen, until the visitor clicks or uses the keyboard, and
 * never with prefers-reduced-motion.
 */
export function HowItWorksDemo(): JSX.Element {
	const [selected, setSelected] = useState<number>(0);
	const [isVisible, setIsVisible] = useState<boolean>(false);
	const [userTookOver, setUserTookOver] = useState<boolean>(false);
	const [prefersReducedMotion, setPrefersReducedMotion] =
		useState<boolean>(true);
	const demoRef = useRef<HTMLDivElement>(null);
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const baseId = useId();

	const isAuto = isVisible && !userTookOver && !prefersReducedMotion;

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setPrefersReducedMotion(query.matches);
		const onChange = (event: MediaQueryListEvent): void =>
			setPrefersReducedMotion(event.matches);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		const demo = demoRef.current;
		if (!demo || !("IntersectionObserver" in window)) return;
		const observer = new IntersectionObserver(
			(entries) => setIsVisible(entries[0]?.isIntersecting ?? false),
			{ threshold: 0.4 },
		);
		observer.observe(demo);
		return () => observer.disconnect();
	}, []);

	// One timer per selected tab; re-armed whenever the selection changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `selected` is read only to restart the timer after each change.
	useEffect(() => {
		if (!isAuto) return;
		const timer = setTimeout(
			() => setSelected((i) => (i + 1) % STEPS.length),
			TAB_DURATION_MS,
		);
		return () => clearTimeout(timer);
	}, [isAuto, selected]);

	const select = useCallback((index: number, focus: boolean): void => {
		setUserTookOver(true);
		setSelected(index);
		if (focus) tabRefs.current[index]?.focus();
	}, []);

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
		const next = rovingIndex(event.key, selected, STEPS.length);
		if (next === null) return;
		event.preventDefault();
		select(next, true);
	}

	return (
		<div
			ref={demoRef}
			className="grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-12"
		>
			<div
				role="tablist"
				aria-label="How an event runs"
				className="grid grid-cols-2 gap-x-4 lg:col-span-5 lg:grid-cols-1 lg:gap-0"
			>
				{STEPS.map((step, index) => {
					const isSelected = index === selected;
					return (
						<button
							key={step.title}
							ref={(el) => {
								tabRefs.current[index] = el;
							}}
							type="button"
							role="tab"
							id={`${baseId}-tab-${index}`}
							aria-selected={isSelected}
							aria-controls={`${baseId}-panel-${index}`}
							tabIndex={isSelected ? 0 : -1}
							onClick={() => select(index, false)}
							onKeyDown={handleKeyDown}
							className={`relative grid min-h-11 content-start gap-0.5 border-t border-perforation py-4 text-left transition-colors duration-150 hover:text-ink motion-reduce:transition-none ${
								isSelected ? "text-ink" : "text-ink/70"
							}`}
						>
							<b className="font-display text-tab font-semibold font-stretch-wide">
								{step.title}
							</b>
							<span>{step.caption}</span>
							{isSelected && (
								// Progress line. Keyed on the tab so it restarts
								// from empty each time auto-advance moves on.
								<span
									key={`${step.title}-${isAuto}`}
									aria-hidden="true"
									className={`absolute -top-px left-0 h-0.5 w-full origin-left bg-ink ${
										isAuto ? "animate-tab-fill" : ""
									}`}
								/>
							)}
						</button>
					);
				})}
			</div>

			<div className="relative grid min-h-90 overflow-hidden rounded-tile border border-perforation bg-ink/4 p-6 lg:col-span-7">
				{STEPS.map((step, index) => {
					const isActive = index === selected;
					return (
						<div
							key={step.title}
							role="tabpanel"
							id={`${baseId}-panel-${index}`}
							aria-labelledby={`${baseId}-tab-${index}`}
							// Inactive panels are visibility:hidden, which also
							// removes them from the accessibility tree.
							className={`col-start-1 row-start-1 grid place-items-center transition-[opacity,translate,visibility] duration-300 ease-landing motion-reduce:transition-none ${
								isActive
									? "visible translate-y-0 opacity-100"
									: "invisible translate-y-2 opacity-0"
							}`}
						>
							<div aria-hidden="true" className="contents">
								<Scene index={index} isActive={isActive} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
