import Link from "next/link";
import { AccountMenu } from "./account-menu";
import { Brand } from "./brand";
import { DASHBOARD, PRIMARY_LINKS } from "./nav-links";
import styles from "./site-header.module.css";
import { ThemeToggle } from "./theme-toggle";
import { VisitorMenu } from "./visitor-menu";

/**
 * The band's contents. A server component: the only interactive parts are the
 * theme toggle and whichever disclosure the reader's state calls for, so
 * nothing else here needs to reach the browser as JavaScript. A signed-in
 * person never downloads the visitor menu, or the other way round.
 *
 * The two states differ in what the band offers, not in how it is built:
 *
 *   visitor    brand ·············· theme  Log in  Host an event  (menu)
 *   signed in  brand ·············· [theme] [Dashboard] [AM Asha ⌄]
 *
 * Below 1024px the links move out of the band into whichever disclosure is
 * present. Below 640px the visitor's Log in and Host an event move with them;
 * Dashboard does not, because it is what a signed-in person opened the site
 * to reach.
 */
export function HeaderNav({
	signedInAs,
	wide = false,
}: {
	signedInAs: string | null;
	wide?: boolean;
}) {
	return (
		<header
			className={`${styles.header}${wide ? ` ${styles.headerWide}` : ""}`}
		>
			<div
				className={[
					styles.band,
					wide ? styles.bandWide : "",
					signedInAs ? styles.bandFramed : "",
				]
					.filter(Boolean)
					.join(" ")}
			>
				<Link
					className={styles.brandLink}
					href="/"
					aria-label="makemyevent home"
				>
					{/* Signed in, the band carries two more controls, and on the
					    narrowest phones the symbol stands in for the full mark. */}
					<Brand tight={signedInAs !== null} />
				</Link>

				<nav className={styles.links} aria-label="Primary">
					{PRIMARY_LINKS.map((link) => (
						<Link key={link.href} className={styles.link} href={link.href}>
							{link.label}
						</Link>
					))}
				</nav>

				<div className={styles.actions}>
					{signedInAs ? (
						<>
							{/* Signed in, the controls are framed boxes: the theme,
							    the way to the dashboard (at every width, since it is
							    why a signed-in person came back), and the profile. */}
							<ThemeToggle className={styles.boxIcon} />
							<Link className={styles.boxButton} href={DASHBOARD.href}>
								{DASHBOARD.label}
							</Link>
							<AccountMenu name={signedInAs} links={PRIMARY_LINKS} />
						</>
					) : (
						<>
							<ThemeToggle />
							<Link className={styles.quiet} href="/signin">
								Log in
							</Link>
							<Link
								className={`${styles.btn} ${styles.btnPrimary}`}
								href="/events/new"
							>
								Host an event
							</Link>
							<VisitorMenu links={PRIMARY_LINKS} />
						</>
					)}
				</div>
			</div>
		</header>
	);
}
