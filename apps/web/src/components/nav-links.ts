/**
 * The header's link sets, in one place because they are shown in three: the
 * band at desktop width, the visitor's menu, and a signed-in person's account
 * panel. Plain data, so the server component and both client disclosures can
 * read it without one importing the other.
 */

export type NavLink = { label: string; href: string };

/** The sections of the marketing page, in the order they appear on it. */
export const PRIMARY_LINKS: readonly NavLink[] = [
	{ label: "Features", href: "/#features" },
	{ label: "How it works", href: "/#how-it-works" },
	{ label: "For communities", href: "/#communities" },
];

/**
 * Its own constant: the band shows it as a pill at every width, because it is
 * the reason a signed-in person came back. Price lives in the footer and on
 * the page, so the band spends its width on this instead.
 *
 * Points at the list itself, not at /dashboard, which only redirects there:
 * the link someone clicks most should not cost them a round trip.
 */
export const DASHBOARD: NavLink = {
	label: "Dashboard",
	href: "/dashboard/organized",
};

/** The rest of the account, which only ever appears in the account panel. */
export const ACCOUNT_LINKS: readonly NavLink[] = [
	{ label: "My tickets", href: "/tickets" },
	{ label: "Manage organizations", href: "/organizations" },
];
