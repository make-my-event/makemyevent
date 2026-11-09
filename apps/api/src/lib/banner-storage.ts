export const BANNER_BUCKET = "event-banners";

/**
 * The storage key ("<eventId>/<file>") of a banner URL, but only if the URL
 * points inside **this event's** folder of our Supabase banner bucket.
 * Anything else returns null: other hosts, other buckets, other events'
 * folders, nested paths, "..", query strings or fragments.
 *
 * Used to accept banner URLs (bannerConfirm, events.update) and to decide
 * which storage object bannerDelete may remove, so a crafted bannerUrl can
 * never point the service-role client at another event's files.
 */
export function eventBannerKey(
	url: string | null | undefined,
	eventId: string,
	supabaseUrl: string | undefined = process.env.SUPABASE_URL,
): string | null {
	if (!url || !supabaseUrl) return null;
	let parsed: URL;
	let base: URL;
	try {
		parsed = new URL(url);
		base = new URL(supabaseUrl);
	} catch {
		return null;
	}
	if (parsed.origin !== base.origin || parsed.search || parsed.hash) {
		return null;
	}
	const prefix = `/storage/v1/object/public/${BANNER_BUCKET}/`;
	if (!parsed.pathname.startsWith(prefix)) return null;

	let key: string;
	try {
		key = decodeURIComponent(parsed.pathname.slice(prefix.length));
	} catch {
		return null;
	}
	const match = /^([^/]+)\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)$/.exec(key);
	if (!match || match[1] !== eventId) return null;
	return key;
}
