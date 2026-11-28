import type { Metadata } from "next";
import { env } from "@/lib/env";

/**
 * The one public address of the site. Search engines are told every page
 * lives here, whichever host served it, so www and the bare domain never
 * count as two copies of the same page. Fixed on purpose: a staging or
 * preview deployment must still point search engines at production.
 *
 * www, because that is the host production serves (the bare domain
 * redirects to it) and the one Google already chose. It must equal
 * production's NEXT_PUBLIC_APP_URL: sign-in returns there, and only a
 * deployment whose address matches this one is opened to search engines.
 */
export const SITE_ORIGIN = "https://www.makemyevent.org";

export const SITE_NAME = "MakeMyEvent";

/**
 * Only the production deployment invites crawlers. Staging, previews and
 * local builds tell them to stay out, so test data is never indexed.
 */
export const isProductionSite = new URL(env.appUrl).origin === SITE_ORIGIN;

/** Pages that are public and worth finding in search, for the sitemap. */
export const PUBLIC_PATHS = [
	"/",
	"/about",
	"/contact",
	"/pricing",
	"/privacy-policy",
	"/terms-of-service",
	"/refund-policy",
] as const;

type PublicPath = (typeof PUBLIC_PATHS)[number];

/**
 * Metadata for an indexable page: its title and description, the address
 * search engines should treat as the original, and the preview card shown
 * when the link is shared in a chat or on social media.
 */
export function publicPageMetadata({
	path,
	title,
	description,
}: {
	path: PublicPath;
	title: string | { absolute: string };
	description: string;
}): Metadata {
	const shareTitle =
		typeof title === "string" ? `${title} — ${SITE_NAME}` : title.absolute;
	return {
		title,
		description,
		alternates: { canonical: path },
		openGraph: {
			type: "website",
			siteName: SITE_NAME,
			url: path,
			title: shareTitle,
			description,
		},
		twitter: { card: "summary", title: shareTitle, description },
	};
}
