"use client";

import { ChevronDownIcon } from "@/components/icons";
import Link from "next/link";
import { useId } from "react";
import { ACCOUNT_LINKS, DASHBOARD, type NavLink } from "./nav-links";
import styles from "./site-header.module.css";
import { useDisclosure } from "./use-disclosure";

/**
 * The account control in the header band: a framed button with the
 * person's initials and first name, which opens the things they do with their own account.
 *
 * For a signed-in person this is the band's only disclosure at every width —
 * there is no hamburger beside it. Below 1024px, where the band has no room
 * for the primary links, they are carried here under a divider: the account
 * comes first, then the tour of the page, then Sign out. Above 1024px the band
 * shows the links and this panel drops them, in CSS, so the markup stays the
 * same.
 *
 * The initials are drawn from the display name, never from a remote avatar
 * URL. Fetching a Google profile picture would tell Google who is reading
 * which page of ours, and would need its host in the image CSP.
 */

/**
 * Up to two initials, as a reader sees them: the first character of the first
 * and last words, uppercased: two words give two letters, one word gives one.
 */
function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const first = Array.from(words[0] ?? "?")[0] ?? "?";
	const last =
		words.length > 1 ? (Array.from(words.at(-1) ?? "")[0] ?? "") : "";
	return `${first}${last}`.toUpperCase();
}

/**
 * What the button calls them: the first word of their name, or, when the
 * name is an email address, the part before the @.
 */
function firstName(name: string): string {
	const trimmed = name.trim();
	const word = trimmed.includes("@")
		? (trimmed.split("@")[0] ?? "")
		: (trimmed.split(/\s+/)[0] ?? "");
	return word || "Account";
}

export function AccountMenu({
	name,
	links,
}: {
	name: string;
	links: readonly NavLink[];
}) {
	const panelId = useId();
	const { open, setOpen, wrapRef, buttonRef } = useDisclosure();

	return (
		<div className={styles.account} ref={wrapRef}>
			<button
				type="button"
				ref={buttonRef}
				className={styles.profile}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((value) => !value)}
			>
				<span className={styles.profileMark} aria-hidden="true">
					{initials(name)}
				</span>
				{/* Their first name, as they'd expect to see themselves; the
				    visible word starts the accessible name (WCAG 2.5.3), and what
				    the button opens follows it, read aloud but not shown. */}
				<span className={styles.profileLabel}>{firstName(name)}</span>
				<span className={styles.srOnly}>, your account</span>
				<ChevronDownIcon className={styles.profileChevron} />
			</button>

			<div className={styles.accountPanel} id={panelId} hidden={!open}>
				<p className={styles.accountName}>{name}</p>

				{/* Also in the band at every width; here too, so the panel is a
				    complete list of where a signed-in person can go. */}
				<Link
					className={styles.accountLink}
					href={DASHBOARD.href}
					onClick={() => setOpen(false)}
				>
					{DASHBOARD.label}
				</Link>
				{ACCOUNT_LINKS.map((link) => (
					<Link
						key={link.href}
						className={styles.accountLink}
						href={link.href}
						onClick={() => setOpen(false)}
					>
						{link.label}
					</Link>
				))}

				{/* Only reachable from here below 1024px; above it, the band
				    carries these and this block is hidden. */}
				<nav className={styles.panelNav} aria-label="Primary">
					{links.map((link) => (
						<Link
							key={link.href}
							className={styles.accountLink}
							href={link.href}
							onClick={() => setOpen(false)}
						>
							{link.label}
						</Link>
					))}
				</nav>

				{/* Last, after everywhere there is to go. Signing out changes
				    state, so it is a POST and stays a form: a GET link would let
				    any page on the web sign someone out by embedding it as an
				    image. */}
				<form action="/auth/signout" method="post">
					<button
						type="submit"
						className={`${styles.accountLink} ${styles.accountSignOut}`}
					>
						Sign out
					</button>
				</form>
			</div>
		</div>
	);
}
