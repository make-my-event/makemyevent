"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import {
	useEffect,
	useId,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { EventRole } from "@makemyevent/core";
import { placeOf, usePendingNav } from "../pending-nav-context";
import styles from "./event-shell.module.css";
import { opensSection, SECTION_LABELS } from "./sections";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";
import {
	CfpIcon,
	EventPageIcon,
	FormIcon,
	GuestsIcon,
	OverviewIcon,
	PartnersIcon,
	PostEventIcon,
	RsvpIcon,
	ScanIcon,
	ScheduleIcon,
	SidebarIcon,
	TicketsIcon,
} from "./sidebar-icons";

/**
 * Each section of an event's dashboard, at /dashboard/{event}/{segment}. The
 * segment is the section's name in plain words, so an address reads as what
 * it opens. The event page itself is edited at /edit, where a new event
 * lands straight from the Create Event popup.
 */
const SECTIONS = [
	{
		segment: "overview",
		label: SECTION_LABELS.overview ?? "",
		Icon: OverviewIcon,
	},
	{ segment: "edit", label: SECTION_LABELS.edit ?? "", Icon: EventPageIcon },
	{
		segment: "form-builder",
		label: SECTION_LABELS["form-builder"] ?? "",
		Icon: FormIcon,
	},
	{
		segment: "guests",
		label: SECTION_LABELS.guests ?? "",
		Icon: GuestsIcon,
	},
	{
		segment: "scan-qr",
		label: SECTION_LABELS["scan-qr"] ?? "",
		Icon: ScanIcon,
	},
	{
		segment: "tickets",
		label: SECTION_LABELS.tickets ?? "",
		Icon: TicketsIcon,
	},
	{ segment: "rsvp", label: SECTION_LABELS.rsvp ?? "", Icon: RsvpIcon },
	{ segment: "cfp", label: SECTION_LABELS.cfp ?? "", Icon: CfpIcon },
	{
		segment: "post-event",
		label: SECTION_LABELS["post-event"] ?? "",
		Icon: PostEventIcon,
	},
	{
		segment: "schedule",
		label: SECTION_LABELS.schedule ?? "",
		Icon: ScheduleIcon,
	},
	{
		segment: "partners",
		label: SECTION_LABELS.partners ?? "",
		Icon: PartnersIcon,
	},
] as const;

/** Phones: the same width the stylesheet switches at. */
const NARROW = "(max-width: 767px)";

function subscribeNarrow(onChange: () => void) {
	const query = window.matchMedia(NARROW);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

/**
 * The event dashboard's sidebar: a toggle at the top, then every section.
 *
 * Open, it shows icons and names. Closed, it is a rail of icons; the names
 * stay in the markup for screen readers and appear beside an icon on hover or
 * keyboard focus.
 *
 * Wide screens push the page over and remember the choice in a cookie, so the
 * server draws the right width on the next load and nothing shifts. Phones
 * always start on the rail, and opening it lays the list over the page, which
 * is too narrow to share; it closes again on a choice, Escape, or a press
 * outside it. The two states are kept apart so one never leaks into the
 * other when a window is resized.
 */
export function EventSidebar({
	eventSlug,
	defaultExpanded,
	role,
}: {
	eventSlug: string;
	defaultExpanded: boolean;
	/** The reader's role; only the sections it opens are listed. Every section until it is known. */
	role?: EventRole | undefined;
}) {
	const navId = useId();
	const segment = useSelectedLayoutSegment();
	// A section pressed is the chosen one at once, while its page loads.
	const { target } = usePendingNav();
	const going = target ? placeOf(target.pathname) : null;
	const current =
		going?.area === "event" && going.slug === eventSlug
			? going.section
			: (segment ?? "");

	const [expanded, setExpanded] = useState(defaultExpanded);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const narrow = useSyncExternalStore(
		subscribeNarrow,
		() => window.matchMedia(NARROW).matches,
		() => false,
	);
	const open = narrow ? drawerOpen : expanded;

	const wrapRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	function toggle() {
		if (narrow) {
			setDrawerOpen((value) => !value);
			return;
		}
		const next = !expanded;
		setExpanded(next);
		// biome-ignore lint/suspicious/noDocumentCookie: one non-sensitive layout preference; the server reads it to draw the right width first time
		document.cookie = `${SIDEBAR_COOKIE}=${next ? "expanded" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
	}

	// The phone drawer closes on Escape, a press outside it, and on growing
	// past phone width, where it would otherwise reopen as the wide layout.
	useEffect(() => {
		if (!drawerOpen) return;
		if (!narrow) {
			setDrawerOpen(false);
			return;
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setDrawerOpen(false);
			buttonRef.current?.focus();
		};
		const onPointerDown = (event: PointerEvent) => {
			if (!wrapRef.current?.contains(event.target as Node))
				setDrawerOpen(false);
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [drawerOpen, narrow]);

	const base = `/dashboard/${encodeURIComponent(eventSlug)}`;
	const sections = SECTIONS.filter(
		({ segment: path }) => !role || opensSection(role, path),
	);

	// Phones: keep the open section's chip in view, centred, whenever it
	// changes. Within the strip only; the page does not move.
	const stripRef = useRef<HTMLElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-centres on purpose whenever the open section changes
	useEffect(() => {
		const strip = stripRef.current;
		const chosen = strip?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!strip || !chosen || strip.scrollWidth <= strip.clientWidth) return;
		strip.scrollTo({
			left: chosen.offsetLeft - (strip.clientWidth - chosen.offsetWidth) / 2,
			behavior: "instant",
		});
	}, [current]);

	return (
		<div
			className={styles.sidebar}
			data-expanded={expanded}
			data-drawer={drawerOpen}
		>
			<div className={styles.panel} ref={wrapRef}>
				<button
					type="button"
					ref={buttonRef}
					className={`${styles.item} ${styles.toggle}`}
					aria-expanded={open}
					aria-controls={navId}
					onClick={toggle}
				>
					<SidebarIcon className={styles.icon} />
					<span className={styles.label}>Sidebar</span>
					<span className={styles.tip} aria-hidden="true">
						{open ? "Collapse sidebar" : "Expand sidebar"}
					</span>
				</button>

				<nav className={styles.nav} id={navId} aria-label="Event">
					<ul className={styles.list}>
						{sections.map(({ segment: path, label, Icon }) => (
							<li key={path}>
								<Link
									className={styles.item}
									href={`${base}/${path}`}
									aria-current={path === current ? "page" : undefined}
									onClick={() => setDrawerOpen(false)}
								>
									<Icon className={styles.icon} />
									<span className={styles.label}>{label}</span>
									<span className={styles.tip} aria-hidden="true">
										{label}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</nav>
			</div>

			{/* Phones: the same sections as a strip of chips under the event
			    header, so the cards get the full width. The stylesheet shows
			    one or the other; the hidden one is out of the page entirely. */}
			<nav ref={stripRef} className={styles.strip} aria-label="Event">
				{sections.map(({ segment: path, label, Icon }) => (
					<Link
						key={path}
						className={styles.chip}
						href={`${base}/${path}`}
						aria-current={path === current ? "page" : undefined}
					>
						<Icon className={styles.chipIcon} />
						{label}
					</Link>
				))}
			</nav>
		</div>
	);
}
