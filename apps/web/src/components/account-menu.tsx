"use client";

import { useId } from "react";
import { ACCOUNT_LINKS, type NavLink } from "./nav-links";
import styles from "./site-header.module.css";
import { useDisclosure } from "./use-disclosure";

/**
 * The account control in the header band: a circular initial that opens the
 * things a signed-in person does with their own account.
 *
 * For a signed-in person this is the band's only disclosure at every width —
 * there is no hamburger beside it. Below 1024px, where the band has no room
 * for the primary links, they are carried here under a divider: the account
 * comes first, the tour of the page last. Above 1024px the band shows them
 * and this panel drops them, in CSS, so the markup stays the same.
 *
 * The initial is drawn from the display name, never from a remote avatar
 * URL. Fetching a Google profile picture would tell Google who is reading
 * which page of ours, and would need its host in the image CSP.
 */

/** First character of the name, as a reader sees it: one grapheme, uppercased. */
function initial(name: string): string {
	return (Array.from(name.trim())[0] ?? "?").toUpperCase();
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
				className={styles.avatar}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((value) => !value)}
			>
				<span aria-hidden="true">{initial(name)}</span>
				{/* The initial is decoration; the name is what is announced. */}
				<span className={styles.srOnly}>Account: {name}</span>
			</button>

			<div className={styles.accountPanel} id={panelId} hidden={!open}>
				<p className={styles.accountName}>{name}</p>

				{ACCOUNT_LINKS.map((link) => (
					<a
						key={link.href}
						className={styles.accountLink}
						href={link.href}
						onClick={() => setOpen(false)}
					>
						{link.label}
					</a>
				))}

				{/* Signing out changes state, so it is a POST and stays a form:
				    a GET link would let any page on the web sign someone out
				    by embedding it as an image. */}
				<form action="/auth/signout" method="post">
					<button
						type="submit"
						className={`${styles.accountLink} ${styles.accountSignOut}`}
					>
						Sign out
					</button>
				</form>

				{/* Only reachable from here below 1024px; above it, the band
				    carries these and this block is hidden. */}
				<nav className={styles.panelNav} aria-label="Primary">
					{links.map((link) => (
						<a
							key={link.href}
							className={styles.accountLink}
							href={link.href}
							onClick={() => setOpen(false)}
						>
							{link.label}
						</a>
					))}
				</nav>
			</div>
		</div>
	);
}
