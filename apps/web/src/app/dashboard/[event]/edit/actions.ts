"use server";

import {
	checkLinks,
	checkSchedule,
	checkVenue,
	eventAddress,
	eventPageInput,
	recordId,
	type ScheduleField,
	sanitizeAbout,
	scheduleInput,
	type VenueField,
} from "@makemyevent/core";
import { Prisma } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { imageUrl } from "@/lib/storage";
import { limited } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/identity";

/**
 * The Event Page tab's writes. Each runs as the person signed in, under
 * row-level security: the owner, admins and organizers can change an event,
 * and the database refuses anyone else whatever this is sent. A refusal
 * reads as nothing changed.
 */

export type EventPageField =
	| "address"
	| "capacity"
	| "posterAlt"
	| "about"
	| ScheduleField
	| VenueField
	| "links";

export type EventPageResult =
	| { ok: true; address: string }
	| {
			ok: false;
			field: EventPageField | null;
			message: string;
			/** Which social link, for field "links". */
			linkIndex?: number;
	  };

const NOT_ALLOWED =
	"You can't change this event. Ask its owner or an admin for the Organizer role.";

function isAddressTaken(error: unknown): boolean {
	// The address table's primary key, through a plain insert or the trigger
	// that guards renames: either way the database's unique violation.
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	)
		return true;
	return (
		error instanceof Error &&
		/event_addresses_pkey|events_slug_key|23505|address .* is taken/.test(
			error.message,
		)
	);
}

/**
 * Saves the whole tab in one transaction, all or nothing: the address, the
 * poster's description, the About text, how guests get in (invite-only for
 * every ticket, listing, the pause, capacity), the schedule, the venue and
 * the social links.
 */
export async function saveEventPage(
	eventId: string,
	input: {
		address: string;
		posterAlt: string;
		inviteOnly: boolean;
		listed: boolean;
		registrationClosed: boolean;
		capacity: string;
		/** The editor's document; checked and rebuilt below, never stored as sent. */
		about: unknown;
		/** Dates on the event's clock, turned into instants below. */
		timeZone: string;
		startDate: string;
		startTime: string;
		endDate: string;
		endTime: string;
		opensAt: string;
		closesAt: string;
		format: string;
		venueAddress: string;
		venueName: string;
		lat: number | null;
		lng: number | null;
		onlineUrl: string;
		/** As typed: each row is turned into its address below. */
		links: { kind: string; value: string }[];
	},
): Promise<EventPageResult> {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fdashboard");
	if (!recordId.safeParse(eventId).success)
		return { ok: false, field: null, message: "That event was not found." };

	const parsed = eventPageInput.safeParse(input);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const key = issue?.path[0];
		return {
			ok: false,
			field:
				key === "address" || key === "capacity" || key === "posterAlt"
					? key
					: null,
			message: issue?.message ?? "Check the details.",
		};
	}
	const values = parsed.data;

	// The About text: rebuilt from what is allowed, with images only from
	// this event's own folder in storage.
	const about =
		input.about === null
			? ({ ok: true, doc: null, words: 0 } as const)
			: sanitizeAbout(input.about, {
					imagePrefix: imageUrl(`events/${eventId}/`),
				});
	if (!about.ok) return { ok: false, field: "about", message: about.message };

	const scheduleParsed = scheduleInput.safeParse(input);
	if (!scheduleParsed.success)
		return { ok: false, field: null, message: "Check the dates." };
	const schedule = checkSchedule(scheduleParsed.data);
	if (!schedule.ok)
		return { ok: false, field: schedule.field, message: schedule.message };
	const venue = checkVenue({
		format: String(input.format),
		venueAddress: String(input.venueAddress ?? ""),
		venueName: String(input.venueName ?? ""),
		lat: typeof input.lat === "number" ? input.lat : null,
		lng: typeof input.lng === "number" ? input.lng : null,
		onlineUrl: String(input.onlineUrl ?? ""),
	});
	if (!venue.ok)
		return { ok: false, field: venue.field, message: venue.message };
	const links = checkLinks(input.links);
	if (!links.ok)
		return {
			ok: false,
			field: "links",
			message: links.message,
			...(links.index === null ? {} : { linkIndex: links.index }),
		};

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, field: null, message: slow.message };

	let before: string | null = null;
	try {
		const saved = await asUser(user.id, async (tx) => {
			const current = await tx.event.findUnique({
				where: { id: eventId },
				select: { slug: true, registrationPausedAt: true },
			});
			if (!current) return false;
			before = current.slug;
			const { count } = await tx.event.updateMany({
				where: { id: eventId },
				data: {
					slug: values.address,
					posterAlt: values.posterAlt,
					about:
						about.doc === null
							? Prisma.DbNull
							: (about.doc as Prisma.InputJsonValue),
					listed: values.listed,
					timeZone: schedule.values.timeZone,
					startsAt: schedule.values.startsAt,
					endsAt: schedule.values.endsAt,
					registrationOpensAt: schedule.values.opensAt,
					registrationClosesAt: schedule.values.closesAt,
					...venue.values,
					capacity: values.capacity === null ? null : BigInt(values.capacity),
					// Kept when already paused, so "since when" stays true.
					registrationPausedAt: values.registrationClosed
						? (current.registrationPausedAt ?? new Date())
						: null,
				},
			});
			if (count === 0) return false;
			await tx.ticketType.updateMany({
				where: { eventId },
				data: { inviteOnly: values.inviteOnly },
			});
			// The list as a whole, in its new order: a handful of rows.
			await tx.eventLink.deleteMany({ where: { eventId } });
			if (links.values.length > 0)
				await tx.eventLink.createMany({
					data: links.values.map((link, position) => ({
						eventId,
						kind: link.kind,
						url: link.url,
						position,
					})),
				});
			return true;
		});
		if (!saved) return { ok: false, field: null, message: NOT_ALLOWED };
	} catch (error) {
		if (isAddressTaken(error))
			return {
				ok: false,
				field: "address",
				message: "That address is taken. Try another.",
			};
		throw error;
	}

	revalidatePath("/dashboard");
	if (before)
		revalidatePath(`/dashboard/${encodeURIComponent(before)}`, "layout");
	revalidatePath(`/dashboard/${encodeURIComponent(values.address)}`, "layout");
	return { ok: true, address: values.address };
}

export type AddressCheck = "available" | "taken" | "invalid" | "slow";

/**
 * Whether an address is free for this event, as the host types it. The
 * database answers yes or no and nothing more, so another host's drafts
 * stay unreadable.
 */
export async function checkAddress(
	eventId: string,
	candidate: string,
): Promise<AddressCheck> {
	const user = await getCurrentUser();
	if (!user || !recordId.safeParse(eventId).success) return "invalid";
	const parsed = eventAddress.safeParse(candidate);
	if (!parsed.success) return "invalid";
	if (await limited("event.address", { user: user.id })) return "slow";
	const [row] = await asUser(
		user.id,
		(tx) =>
			tx.$queryRaw<{ available: boolean }[]>`
			SELECT app.address_available(${parsed.data}, ${eventId}::uuid) AS available
		`,
	);
	return row?.available ? "available" : "taken";
}

/**
 * Whether the event is listed on Explore once published: the one answer the
 * visibility question after Create Event asks. Only this column changes;
 * anything else on the page is left as it was.
 */
export async function setListing(
	eventId: string,
	listed: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fdashboard");
	if (!recordId.safeParse(eventId).success || typeof listed !== "boolean")
		return { ok: false, message: "That event was not found." };

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	const { count } = await asUser(user.id, (tx) =>
		tx.event.updateMany({ where: { id: eventId }, data: { listed } }),
	);
	if (count === 0) return { ok: false, message: NOT_ALLOWED };
	revalidatePath("/dashboard");
	return { ok: true };
}
