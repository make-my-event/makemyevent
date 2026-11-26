import { recordId } from "@makemyevent/core";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { env } from "@/lib/env";
import {
	ImageRejected,
	processInline,
	processLogo,
	processPoster,
	UPLOAD_MAX_BYTES,
} from "@/lib/images";
import { imageUrl, putImage, removeImages } from "@/lib/storage";
import { limited, tooMany } from "@/lib/rate-limit";
import { type CurrentUser, getCurrentUser } from "@/lib/supabase/identity";

/**
 * An event's poster and logo: POST to set one (multipart, `kind` and
 * `file`), DELETE ?kind= to take it off.
 *
 * A route rather than a server action, because a poster is bigger than the
 * 1 MB a server action accepts, and raising that for every action would widen
 * every form. In exchange this does what server actions do for free: it
 * refuses requests from any other site.
 *
 * Order matters. The database is asked first whether this person may change
 * the event (row-level security, as everywhere). Then the image is decoded
 * and re-encoded, stored under a fresh name, and only then recorded on the
 * event, again under row-level security. The old files go last, so a failure
 * at any step leaves the event showing what it showed before.
 */

type Kind = "poster" | "logo";
/** An image dropped into the About text: stored, not recorded on the event. */
type UploadKind = Kind | "inline";
type Params = { params: Promise<{ id: string }> };

function answer(status: number, message: string) {
	return Response.json({ error: message }, { status });
}

/** Same-site only: a form on another site cannot post here as the user. */
function fromThisSite(request: Request): boolean {
	return request.headers.get("origin") === new URL(env.appUrl).origin;
}

function kindOf(value: unknown): Kind | null {
	return value === "poster" || value === "logo" ? value : null;
}

function uploadKindOf(value: unknown): UploadKind | null {
	return value === "inline" ? value : kindOf(value);
}

/** Signed in, an event id, and the database's word that they may change it. */
async function authorise(
	request: Request,
	params: Params["params"],
	limit: "event.media" | "event.write",
) {
	if (!fromThisSite(request))
		return { error: answer(403, "Requests must come from this site.") };
	const user = await getCurrentUser();
	if (!user) return { error: answer(401, "Sign in to change this event.") };
	const { id } = await params;
	if (!recordId.safeParse(id).success)
		return { error: answer(404, "That event was not found.") };
	const slow = await limited(limit, { user: user.id });
	if (slow) return { error: tooMany(slow) };
	const [row] = await asUser(
		user,
		(tx) =>
			tx.$queryRaw<{ allowed: boolean }[]>`
			SELECT app.manages_event(${id}::uuid) AS allowed
		`,
	);
	if (!row?.allowed)
		return { error: answer(403, "You can't change this event's images.") };
	return { user, eventId: id };
}

/** Every stored file behind a recorded path. */
function filesOf(kind: Kind, base: string | null): string[] {
	if (!base) return [];
	return kind === "poster"
		? [`${base}-1080.webp`, `${base}-540.webp`]
		: [`${base}-256.webp`];
}

async function revalidate(eventId: string, user: CurrentUser) {
	const event = await asUser(user, (tx) =>
		tx.event.findUnique({ where: { id: eventId }, select: { slug: true } }),
	);
	if (event)
		revalidatePath(`/dashboard/${encodeURIComponent(event.slug)}`, "layout");
	revalidatePath("/dashboard");
}

export async function POST(request: Request, { params }: Params) {
	const auth = await authorise(request, params, "event.media");
	if ("error" in auth) return auth.error;
	const { user, eventId } = auth;

	// Refused before reading the body, when the size is stated.
	const stated = Number(request.headers.get("content-length") ?? "0");
	if (stated > UPLOAD_MAX_BYTES + 64 * 1024)
		return answer(413, "Use an image under 4 MB.");

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return answer(400, "That upload could not be read.");
	}
	const kind = uploadKindOf(form.get("kind"));
	const file = form.get("file");
	if (!kind || !(file instanceof File))
		return answer(400, "Choose an image to upload.");
	if (file.size > UPLOAD_MAX_BYTES)
		return answer(413, "Use an image under 4 MB.");

	const input = Buffer.from(await file.arrayBuffer());

	// Into the About text: stored and handed back. The document that holds
	// its address is saved with the rest of the tab, and the server takes
	// only addresses under this event's own folder.
	if (kind === "inline") {
		const path = `events/${eventId}/about-${crypto.randomUUID()}.webp`;
		try {
			await putImage(path, await processInline(input));
		} catch (error) {
			if (error instanceof ImageRejected) return answer(422, error.message);
			throw error;
		}
		return Response.json({ path, url: imageUrl(path) });
	}

	const base = `events/${eventId}/${kind}-${crypto.randomUUID()}`;
	let stored: string[];
	try {
		if (kind === "poster") {
			const { large, small } = await processPoster(input);
			stored = filesOf("poster", base);
			await putImage(stored[0] as string, large);
			await putImage(stored[1] as string, small);
		} else {
			const logo = await processLogo(input);
			stored = filesOf("logo", base);
			await putImage(stored[0] as string, logo);
		}
	} catch (error) {
		if (error instanceof ImageRejected) return answer(422, error.message);
		throw error;
	}

	// Recorded under row-level security; refused means nothing changes, and
	// the files just stored are taken back.
	const previous = await asUser(user, async (tx) => {
		const before = await tx.event.findUnique({
			where: { id: eventId },
			select: { posterPath: true, logoPath: true },
		});
		const { count } = await tx.event.updateMany({
			where: { id: eventId },
			data: kind === "poster" ? { posterPath: base } : { logoPath: base },
		});
		if (count === 0) return undefined;
		return kind === "poster"
			? (before?.posterPath ?? null)
			: (before?.logoPath ?? null);
	});
	if (previous === undefined) {
		await removeImages(stored).catch(() => {});
		return answer(403, "You can't change this event's images.");
	}

	// The old files last: a failure here leaves only unused files behind.
	await removeImages(filesOf(kind, previous)).catch(() => {});
	await revalidate(eventId, user);

	return Response.json({ path: base, url: imageUrl(stored[0] as string) });
}

export async function DELETE(request: Request, { params }: Params) {
	const auth = await authorise(request, params, "event.write");
	if ("error" in auth) return auth.error;
	const { user, eventId } = auth;
	const kind = kindOf(new URL(request.url).searchParams.get("kind"));
	if (!kind) return answer(400, "Say which image to remove.");

	const previous = await asUser(user, async (tx) => {
		const before = await tx.event.findUnique({
			where: { id: eventId },
			select: { posterPath: true, logoPath: true },
		});
		const { count } = await tx.event.updateMany({
			where: { id: eventId },
			data: kind === "poster" ? { posterPath: null } : { logoPath: null },
		});
		if (count === 0) return undefined;
		return kind === "poster"
			? (before?.posterPath ?? null)
			: (before?.logoPath ?? null);
	});
	if (previous === undefined)
		return answer(403, "You can't change this event's images.");

	await removeImages(filesOf(kind, previous)).catch(() => {});
	await revalidate(eventId, user);
	return new Response(null, { status: 204 });
}
