import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE_ORIGIN } from "@/lib/site";

/**
 * The public pages, for search engines. Only pages anyone may read are
 * listed: nothing behind sign-in, and nothing that would point at it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
	return PUBLIC_PATHS.map((path) => ({ url: new URL(path, SITE_ORIGIN).href }));
}
