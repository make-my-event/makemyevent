import type { MetadataRoute } from "next";
import { isProductionSite, SITE_ORIGIN } from "@/lib/site";

/**
 * robots.txt is public and read by anyone, so it names no private paths:
 * listing them would only advertise them. Pages that must stay out of search
 * say so themselves with a noindex tag, and access is enforced by the server,
 * never by this file.
 */
export default function robots(): MetadataRoute.Robots {
	if (!isProductionSite) {
		return { rules: { userAgent: "*", disallow: "/" } };
	}
	return {
		rules: { userAgent: "*", allow: "/" },
		sitemap: new URL("/sitemap.xml", SITE_ORIGIN).href,
	};
}
