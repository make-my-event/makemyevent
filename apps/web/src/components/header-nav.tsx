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
 *   signed in  brand ·············· theme  Dashboard              (avatar)
 *
 * Below 1024px the links move out of the band into whichever disclosure is
 * present. Below 640px the visitor's Log in and Host an event move with them;
 * Dashboard does not, because it is what a signed-in person opened the site
 * to reach.
 */
export function HeaderNav({ signedInAs }: { signedInAs: string | null }) {
	return (
		<header className={styles.header}>
			<div className={styles.band}>
				<a className={styles.brandLink} href="/" aria-label="makemyevent home">
					{/* Signed in, the band carries two more controls, and on the
					    narrowest phones the symbol stands in for the full mark. */}
					<Brand tight={signedInAs !== null} />
				</a>

				<nav className={styles.links} aria-label="Primary">
					{PRIMARY_LINKS.map((link) => (
						<a key={link.href} className={styles.link} href={link.href}>
							{link.label}
						</a>
					))}
				</nav>

				<div className={styles.actions}>
					<ThemeToggle />

					{signedInAs ? (
						<>
							<a
								className={`${styles.btn} ${styles.btnPrimary} ${styles.btnAlways}`}
								href={DASHBOARD.href}
							>
								{DASHBOARD.label}
							</a>
							<AccountMenu name={signedInAs} links={PRIMARY_LINKS} />
						</>
					) : (
						<>
							<a className={styles.quiet} href="/signin">
								Log in
							</a>
							<a
								className={`${styles.btn} ${styles.btnPrimary}`}
								href="/signin"
							>
								Host an event
							</a>
							<VisitorMenu links={PRIMARY_LINKS} />
						</>
					)}
				</div>
			</div>
		</header>
	);
}
