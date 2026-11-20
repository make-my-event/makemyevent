"use client";

import { useId } from "react";
import type { NavLink } from "./nav-links";
import styles from "./site-header.module.css";
import { useDisclosure } from "./use-disclosure";

/**
 * The menu a visitor opens below 1024px, where the band has no room for the
 * primary links.
 *
 * Only a visitor gets this. A signed-in person has the account panel instead,
 * which carries the same links: two controls in the same corner opening two
 * panels of overlapping links is a choice nobody wants to make.
 *
 * The panel is positioned against the header rather than placed after the
 * band, so opening it covers the top of the page instead of pushing the page
 * down — the band is sticky, and a shove on every open is layout shift a
 * reader did not ask for.
 */
export function VisitorMenu({ links }: { links: readonly NavLink[] }) {
	const menuId = useId();
	const { open, setOpen, wrapRef, buttonRef } = useDisclosure();

	return (
		<div className={styles.menuWrap} ref={wrapRef}>
			<button
				type="button"
				ref={buttonRef}
				className={styles.menuButton}
				aria-label={open ? "Close menu" : "Open menu"}
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((value) => !value)}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					aria-hidden="true"
				>
					{open ? (
						<path d="M6 6l12 12M18 6L6 18" />
					) : (
						<path d="M4 8h16M4 16h16" />
					)}
				</svg>
			</button>

			<div className={styles.menu} id={menuId} hidden={!open}>
				<nav aria-label="Primary">
					{links.map((link) => (
						<a
							key={link.href}
							className={styles.menuLink}
							href={link.href}
							onClick={() => setOpen(false)}
						>
							{link.label}
						</a>
					))}
				</nav>

				{/* Sign-in sits in the band itself from 640px up, so this block
				    goes quiet there and the menu carries only the links. */}
				<div className={styles.menuAuth}>
					<a
						className={styles.menuLink}
						href="/signin"
						onClick={() => setOpen(false)}
					>
						Log in
					</a>
					<a
						className={`${styles.btn} ${styles.btnPrimary} ${styles.menuBtn}`}
						href="/signin"
						onClick={() => setOpen(false)}
					>
						Host an event
					</a>
				</div>
			</div>
		</div>
	);
}
