import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Event posters and logos, in Supabase Storage.
 *
 * One public-read bucket. Only this server writes to it, and only images it
 * has decoded and re-encoded itself (lib/images.ts), after the database has
 * said the person may change the event. The secret key is used for nothing
 * else: no database access goes through it, and it never reaches a browser.
 *
 * Files are named by a fresh random id per upload, so a replaced poster is a
 * new address (no stale caches) and no address can be guessed.
 */
export const MEDIA_BUCKET = "event-media";

function client() {
	const key = process.env.SUPABASE_SECRET_KEY;
	if (!key)
		throw new Error(
			"SUPABASE_SECRET_KEY is not set in apps/web/.env.local; poster and logo uploads need it.",
		);
	return createClient(env.supabaseUrl, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

/**
 * Stores one processed image, never overwriting. Cached for an hour, not a
 * year: a new upload gets a new name anyway, so long caching buys nothing,
 * while a short one means a removed poster (a wrong or sensitive one, say)
 * stops being served from Supabase's CDN within the hour.
 */
export async function putImage(path: string, body: Buffer): Promise<void> {
	const { error } = await client()
		.storage.from(MEDIA_BUCKET)
		.upload(path, body, {
			contentType: "image/webp",
			cacheControl: "3600",
			upsert: false,
		});
	if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

/** Removes images; a file already gone is not an error. */
export async function removeImages(paths: readonly string[]): Promise<void> {
	if (paths.length === 0) return;
	const { error } = await client()
		.storage.from(MEDIA_BUCKET)
		.remove([...paths]);
	if (error) throw new Error(`Storage remove failed: ${error.message}`);
}

/** The public address of a stored image. */
export function imageUrl(path: string): string {
	return `${env.supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path
		.split("/")
		.map(encodeURIComponent)
		.join("/")}`;
}
