// Creates or updates the event-media bucket in the Supabase project named by
// NEXT_PUBLIC_SUPABASE_URL, with the rules below. Safe to run again.
//
//   pnpm --filter @makemyevent/web storage:setup
//
// The bucket is public to read: posters are shown on public event pages,
// and every file name has a random id, so none can be guessed. Writing is
// for the server's secret key alone, and it only ever writes WebP it has
// re-encoded itself (src/lib/images.ts), so the bucket accepts nothing else.
import { createClient } from "@supabase/supabase-js";

const BUCKET = "event-media";
const RULES = {
	public: true,
	allowedMimeTypes: ["image/webp"],
	// The largest poster we write is far below this.
	fileSizeLimit: "2MB",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
	console.error(
		"Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in apps/web/.env.local first.",
	);
	process.exit(1);
}

const project = new URL(url).hostname.split(".")[0];
const storage = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false },
}).storage;

const { data: existing } = await storage.getBucket(BUCKET);
const { error } = existing
	? await storage.updateBucket(BUCKET, RULES)
	: await storage.createBucket(BUCKET, RULES);
if (error) {
	console.error(`Could not set up ${BUCKET} on ${project}: ${error.message}`);
	process.exit(1);
}
console.log(
	`${existing ? "Updated" : "Created"} bucket ${BUCKET} on project ${project}.`,
);
