"use client";

import { LandingNavLinks } from "@/components/landing/landing-nav-links";
import { pillButtonClass } from "@/components/landing/pill-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Logo } from "@/components/ui/logo";
import { AccountMenu, type AccountMenuUser } from "./account-menu";

import { ArrowRight, LayoutDashboard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import type { JSX } from "react";

const DASHBOARD_HREF = "/dashboard";

export type SiteHeaderProps =
	| {
			variant?: "app";
			activeNav?: "events";
	  }
	| {
			/**
			 * Floating pill header for the marketing landing page. The page
			 * reads the session on the server and passes `user` (null when
			 * signed out), so the signed-in state renders with no flash.
			 */
			variant: "landing";
			user: AccountMenuUser | null;
	  };

export function SiteHeader(props: SiteHeaderProps): JSX.Element {
	if (props.variant === "landing") {
		return <LandingHeader user={props.user} />;
	}
	return <AppHeader activeNav={props.activeNav} />;
}

interface LandingHeaderProps {
	user: AccountMenuUser | null;
}

function LandingHeader({ user }: LandingHeaderProps): JSX.Element {
	return (
		// pointer-events-none on the shell so the transparent strip around the
		// pill never blocks clicks on the page underneath.
		<div className="pointer-events-none sticky top-0 z-10 px-4 pt-3 md:px-6">
			<header className="pointer-events-auto mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-2 rounded-pill border border-ink/15 bg-paper/82 py-1 pr-2 pl-4 backdrop-blur-md">
				<Link
					href="/"
					aria-label="makemyevent home"
					className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 font-display text-xl leading-none font-semibold tracking-tight no-underline"
				>
					<Logo width={22} height={24} className="h-6 w-auto" priority />
					{/* Below 400px the wordmark text is visually hidden so the
					    actions fit (spec breakpoint, not on Tailwind's scale). */}
					<span translate="no" className="max-[399px]:sr-only">
						makemyevent
					</span>
				</Link>

				<LandingNavLinks />

				<div className="flex shrink-0 items-center gap-2">
					<ThemeToggle variant="pill" />
					{user ? (
						<>
							<Link
								href={DASHBOARD_HREF}
								className={`${pillButtonClass("primary", "sm")} max-sm:hidden`}
							>
								Dashboard
							</Link>
							<AccountMenu user={user} dashboardHref={DASHBOARD_HREF} />
						</>
					) : (
						<Link href="/login" className={pillButtonClass("primary", "sm")}>
							Host an event
						</Link>
					)}
				</div>
			</header>
		</div>
	);
}

interface AppHeaderProps {
	activeNav?: "events";
}

function AppHeader({ activeNav }: AppHeaderProps): JSX.Element {
	const { data: session, status } = useSession();
	const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
	const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuButtonRef = useRef<HTMLButtonElement>(null);
	const mobileNavRef = useRef<HTMLDivElement>(null);
	const mobileNavButtonRef = useRef<HTMLButtonElement>(null);
	const accountMenuId = useId();
	const mobileNavId = useId();

	// Close either panel on a pointer press outside it. The toggle buttons
	// count as "inside": otherwise pressing the hamburger to close the drawer
	// would close it here and its click handler would immediately reopen it.
	useEffect(() => {
		function handlePointerDown(event: PointerEvent): void {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (!menuRef.current?.contains(target)) {
				setIsMenuOpen(false);
			}
			if (
				!mobileNavRef.current?.contains(target) &&
				!mobileNavButtonRef.current?.contains(target)
			) {
				setIsMobileNavOpen(false);
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, []);

	// Escape closes whichever panel is open and returns focus to its toggle.
	useEffect(() => {
		if (!isMenuOpen && !isMobileNavOpen) return;
		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key !== "Escape") return;
			if (isMenuOpen) {
				setIsMenuOpen(false);
				menuButtonRef.current?.focus();
			}
			if (isMobileNavOpen) {
				setIsMobileNavOpen(false);
				mobileNavButtonRef.current?.focus();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isMenuOpen, isMobileNavOpen]);

	const user = session?.user;
	const initials = user?.name
		? user.name
				.split(" ")
				.map((n) => n[0])
				.slice(0, 2)
				.join("")
				.toUpperCase()
		: (user?.email?.[0]?.toUpperCase() ?? "U");

	return (
		<header className="border-b border-perforation">
			<div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-2 md:px-6 lg:px-8">
				<div className="flex items-center gap-2 sm:gap-8">
					{/* Mobile hamburger */}
					<button
						ref={mobileNavButtonRef}
						type="button"
						onClick={() => setIsMobileNavOpen((open) => !open)}
						className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink/70 transition-colors duration-150 hover:bg-perforation/20 hover:text-ink md:hidden"
						aria-label={
							isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"
						}
						aria-expanded={isMobileNavOpen}
						aria-controls={mobileNavId}
					>
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							{isMobileNavOpen ? (
								<>
									<path d="M18 6 6 18" />
									<path d="m6 6 12 12" />
								</>
							) : (
								<>
									<line x1="4" x2="20" y1="12" y2="12" />
									<line x1="4" x2="20" y1="6" y2="6" />
									<line x1="4" x2="20" y1="18" y2="18" />
								</>
							)}
						</svg>
					</button>

					<Link
						href="/"
						aria-label="makemyevent home"
						className="flex min-h-11 items-center gap-2 rounded-md font-display text-h3 font-semibold tracking-tight"
					>
						<Logo
							width={36}
							height={36}
							className="h-8 w-8 object-contain sm:h-9 sm:w-9"
							priority
						/>
						<span className="hidden sm:inline" translate="no">
							makemyevent
						</span>
					</Link>

					<nav aria-label="Main" className="hidden items-center gap-6 md:flex">
						<Link
							href="/events"
							aria-current={activeNav === "events" ? "page" : undefined}
							className={`label inline-flex h-11 items-center rounded-sm transition-colors duration-150 ${
								activeNav === "events"
									? "text-ink underline decoration-stamp decoration-2 underline-offset-8"
									: "text-ink/70 hover:text-ink"
							}`}
						>
							Events
						</Link>
					</nav>
				</div>

				<div className="flex items-center gap-2 sm:gap-4">
					{/* Dashboard (signed-in users only) — icon-only on xs, full on sm+.
					    Hidden while the session loads so it never flashes for
					    signed-out visitors. */}
					{status === "authenticated" && (
						<Link
							href="/dashboard"
							aria-label="Dashboard"
							className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-md bg-stamp text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-90 active:opacity-80 sm:w-auto sm:px-4"
						>
							<LayoutDashboard
								width={16}
								height={16}
								className="sm:hidden"
								aria-hidden="true"
							/>
							<span className="hidden sm:inline">Dashboard</span>
							<ArrowRight
								width={16}
								height={16}
								className="hidden sm:block"
								aria-hidden="true"
							/>
						</Link>
					)}

					{/* Theme Switcher */}
					<ThemeToggle />

					{/* User Profile Menu or Sign In */}
					{status === "loading" ? (
						<div
							aria-hidden="true"
							className="h-11 w-11 rounded-md bg-perforation/40 motion-safe:animate-pulse"
						/>
					) : status === "authenticated" && user ? (
						<div className="relative" ref={menuRef}>
							<button
								ref={menuButtonRef}
								type="button"
								onClick={() => setIsMenuOpen((open) => !open)}
								aria-expanded={isMenuOpen}
								aria-controls={accountMenuId}
								className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-1 transition-colors duration-150 hover:bg-perforation/20 sm:px-2"
							>
								{user.image ? (
									<Image
										src={user.image}
										alt=""
										width={32}
										height={32}
										unoptimized
										className="h-8 w-8 rounded-full border border-perforation object-cover"
									/>
								) : (
									<div
										aria-hidden="true"
										className="flex h-8 w-8 items-center justify-center rounded-full bg-stamp font-mono text-xs font-medium text-paper"
									>
										{initials}
									</div>
								)}
								<span className="sr-only">Account menu for </span>
								<span className="sr-only sm:not-sr-only sm:inline-block sm:max-w-36 sm:truncate sm:text-sm sm:font-medium sm:text-ink">
									{user.name || user.email?.split("@")[0]}
								</span>
								<svg
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className={`hidden text-ink/70 transition-transform duration-200 sm:block ${
										isMenuOpen ? "rotate-180" : ""
									}`}
								>
									<path d="m6 9 6 6 6-6" />
								</svg>
							</button>

							{isMenuOpen && (
								<div
									id={accountMenuId}
									className="absolute right-0 top-full z-20 mt-2 flex w-64 flex-col rounded-md border border-perforation bg-paper py-2 text-sm shadow-lg animate-in fade-in duration-150"
								>
									<div className="flex flex-col gap-1 border-b border-perforation px-4 pb-2">
										<p className="truncate font-display font-medium text-ink">
											{user.name || "Signed in"}
										</p>
										<p className="truncate font-mono text-sm text-ink/70">
											{user.email}
										</p>
									</div>

									<Link
										href="/dashboard?tab=tickets"
										onClick={() => setIsMenuOpen(false)}
										className="flex min-h-11 items-center justify-between gap-2 px-4 font-medium text-ink transition-colors duration-150 hover:bg-perforation/20"
									>
										<span>My Tickets</span>
										<span className="rounded-sm border border-stamp/30 bg-stamp/10 px-2 py-1 font-mono text-xs text-stamp">
											Passes
										</span>
									</Link>

									<Link
										href="/profile"
										onClick={() => setIsMenuOpen(false)}
										className="flex min-h-11 items-center px-4 text-ink transition-colors duration-150 hover:bg-perforation/20"
									>
										Profile & Account
									</Link>

									<Link
										href="/dashboard"
										onClick={() => setIsMenuOpen(false)}
										className="flex min-h-11 items-center px-4 text-ink transition-colors duration-150 hover:bg-perforation/20"
									>
										Organizer Dashboard
									</Link>

									<Link
										href="/onboarding"
										onClick={() => setIsMenuOpen(false)}
										className="flex min-h-11 items-center px-4 text-ink transition-colors duration-150 hover:bg-perforation/20"
									>
										Create Another Organizer
									</Link>

									<button
										type="button"
										onClick={() => {
											setIsMenuOpen(false);
											signOut({ callbackUrl: "/" });
										}}
										className="flex min-h-11 w-full items-center border-t border-perforation px-4 text-left font-medium text-alert transition-colors duration-150 hover:bg-alert/10"
									>
										Sign Out
									</button>
								</div>
							)}
						</div>
					) : (
						<Link
							href="/login"
							className="label inline-flex h-11 items-center rounded-md bg-stamp px-4 text-paper transition-opacity duration-150 hover:opacity-90 active:opacity-80"
						>
							Sign In
						</Link>
					)}
				</div>
			</div>

			{/* Mobile Navigation Drawer */}
			{isMobileNavOpen && (
				<nav
					ref={mobileNavRef}
					id={mobileNavId}
					aria-label="Main"
					className="flex flex-col gap-2 border-t border-perforation bg-paper p-4 animate-in slide-in-from-top duration-150 md:hidden"
				>
					<Link
						href="/events"
						onClick={() => setIsMobileNavOpen(false)}
						aria-current={activeNav === "events" ? "page" : undefined}
						className={`label flex min-h-11 items-center rounded-md px-4 transition-colors duration-150 ${
							activeNav === "events"
								? "bg-ink text-paper"
								: "text-ink/70 hover:bg-perforation/20"
						}`}
					>
						Events
					</Link>
					{status === "authenticated" && (
						<>
							<div aria-hidden="true" className="border-t border-perforation" />
							<Link
								href="/dashboard"
								onClick={() => setIsMobileNavOpen(false)}
								className="label flex min-h-11 items-center rounded-md px-4 text-ink/70 transition-colors duration-150 hover:bg-perforation/20"
							>
								Dashboard
							</Link>
							<Link
								href="/profile"
								onClick={() => setIsMobileNavOpen(false)}
								className="label flex min-h-11 items-center rounded-md px-4 text-ink/70 transition-colors duration-150 hover:bg-perforation/20"
							>
								Profile
							</Link>
						</>
					)}
				</nav>
			)}
		</header>
	);
}
