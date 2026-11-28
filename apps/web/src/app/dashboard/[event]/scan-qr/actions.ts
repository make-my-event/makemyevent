"use server";

import { readTicketCode, recordId, type ScanOutcome } from "@makemyevent/core";
import { Prisma, type Tx } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { masterKey, readPass } from "@/lib/pass-token";
import { limited } from "@/lib/rate-limit";
import { actingUser } from "@/lib/require-user";
import { getCurrentUser } from "@/lib/supabase/identity";
import { checkInDay } from "../check-in-day";
import { type DoorCount, doorCountFor, forgetDoorCount } from "./door-count";

/**
 * The door: a scanned pass, a typed ticket code, or a guest picked from the
 * list, checked by the server and let in under row-level security, as the
 * person scanning (anyone on the team). The pass's signature, its event
 * and its key version are checked here; the guest's state and their
 * ticket's days by the database. One check-in per guest per day, so two
 * doors scanning one person at once get one "Admitted" and one "Already
 * in". With doors on, each check-in records the door: the scanner's, or
 * an assigned volunteer's own (the database fills and holds it).
 *
 * Door staff see a guest's name, ticket and ticket code: never their email
 * or phone, since the screen is seen by the queue.
 */

export type ScanResult =
	| {
			ok: true;
			outcome: ScanOutcome;
			/** For admitted and already in. */
			guest?: { id: string; name: string; ticket: string; code: string };
			/** For admitted: when, by the database's clock. */
			at?: string;
			/** For admitted: the door it recorded, if the event has doors. */
			door?: string | null;
			/** For already in: when, by whom, at which door. */
			earlier?: { at: string; by: string | null; door: string | null };
	  }
	| { ok: false; message: string };

export type { DoorCount } from "./door-count";

/** One guest in the door's list. */
export type DoorGuest = {
	id: string;
	name: string;
	ticket: string;
	code: string;
	/** Checked in today: when, by whom, at which door. Null: not yet. */
	in: { at: string; by: string | null; door: string | null } | null;
};

export type DoorFilter = "all" | "in" | "out";

const NO_KEY =
	"Passes aren't set up on this site yet. It needs TICKET_SIGNING_KEY.";
const PAGE = 30;
/** The most one read returns: ten pages, re-read together. */
const TAKE_MAX = 300;

/** The door this phone is at, as it sent it: an id, or none. */
function doorOf(value: unknown): string | null {
	return typeof value === "string" && recordId.safeParse(value).success
		? value
		: null;
}

type Found = {
	id: string;
	attendeeName: string;
	status: string;
	ticketCode: string;
	ticketType: { name: string };
};

const FOUND = {
	id: true,
	attendeeName: true,
	status: true,
	ticketCode: true,
	ticketType: { select: { name: true } },
} as const;

const who = (guest: Found) => ({
	id: guest.id,
	name: guest.attendeeName,
	ticket: guest.ticketType.name,
	code: guest.ticketCode,
});

async function earlierCheckIn(
	tx: Tx,
	registrationId: string,
	dayId: bigint | null,
) {
	const row = await tx.checkIn.findFirst({
		where: { registrationId, eventDayId: dayId },
		select: {
			checkedInAt: true,
			door: { select: { name: true } },
			by: { select: { displayName: true } },
		},
	});
	return row
		? {
				at: row.checkedInAt.toISOString(),
				by: row.by?.displayName ?? null,
				door: row.door?.name ?? null,
			}
		: null;
}

/** Lets one found guest in, or says why not. */
async function admit(
	user: Awaited<ReturnType<typeof actingUser>>,
	eventId: string,
	doorId: string | null,
	method: "scan" | "manual",
	find: (tx: Tx) => Promise<Found | null>,
): Promise<ScanResult> {
	let result: ScanResult;
	try {
		result = await asUser(user, async (tx): Promise<ScanResult> => {
			const guest = await find(tx);
			if (!guest) return { ok: true, outcome: "unknown" };
			if (guest.status === "cancelled")
				return { ok: true, outcome: "cancelled", guest: who(guest) };
			if (guest.status !== "confirmed")
				return { ok: true, outcome: "waitlisted", guest: who(guest) };
			const day = await checkInDay(tx, eventId);
			if (!day.ok) return { ok: true, outcome: "not_running" };
			const earlier = await earlierCheckIn(tx, guest.id, day.dayId);
			if (earlier)
				return { ok: true, outcome: "already_in", guest: who(guest), earlier };
			const made = await tx.checkIn.create({
				data: {
					registrationId: guest.id,
					eventId,
					eventDayId: day.dayId,
					method,
					doorId,
				},
				select: { checkedInAt: true, door: { select: { name: true } } },
			});
			return {
				ok: true,
				outcome: "admitted",
				guest: who(guest),
				at: made.checkedInAt.toISOString(),
				door: made.door?.name ?? null,
			};
		});
	} catch (error) {
		const said =
			error instanceof Error
				? `${String((error as { meta?: { driverAdapterError?: { cause?: { message?: unknown } } } }).meta?.driverAdapterError?.cause?.message ?? "")} ${error.message}`
				: "";
		// Their ticket's own days (the tickets migration).
		if (/one entry used/.test(said))
			return { ok: true, outcome: "used_elsewhere" };
		if (/not this day/.test(said)) return { ok: true, outcome: "not_today" };
		// Doors (the event_doors migration).
		if (/not your door/.test(said))
			return {
				ok: false,
				message:
					"You're assigned to another door. Ask an organizer to move you.",
			};
		if (/door not open/.test(said))
			return {
				ok: false,
				message: "That door was removed. Pick your door again.",
			};
		// Another door let them in a moment ago: say who, from a fresh read.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		)
			return asUser(user, async (tx): Promise<ScanResult> => {
				const guest = await find(tx);
				const day = await checkInDay(tx, eventId);
				if (!guest || !day.ok) return { ok: true, outcome: "unknown" };
				const earlier = await earlierCheckIn(tx, guest.id, day.dayId);
				return {
					ok: true,
					outcome: "already_in",
					guest: who(guest),
					...(earlier ? { earlier } : {}),
				};
			});
		if (/row-level security|permission denied/.test(said))
			return { ok: false, message: "You can't let guests in at this event." };
		throw error;
	}
	if (result.ok && result.outcome === "admitted") {
		await forgetDoorCount(eventId);
		revalidatePath("/dashboard/[event]/guests", "page");
	}
	return result;
}

async function ready(eventId: string) {
	const user = await actingUser();
	if (!recordId.safeParse(eventId).success)
		return { ok: false as const, message: "That event was not found." };
	const slow = await limited("guest.check_in", { user: user.id });
	if (slow) return { ok: false as const, message: slow.message };
	return { ok: true as const, user };
}

/** A pass the camera read. */
export async function scanPass(
	eventId: string,
	scanned: string,
	doorId?: string | null,
): Promise<ScanResult> {
	const start = await ready(eventId);
	if (!start.ok) return start;
	const master = masterKey();
	if (!master) return { ok: false, message: NO_KEY };
	const claims =
		typeof scanned === "string" && scanned.length <= 200
			? readPass(master, scanned.trim())
			: null;
	if (!claims) return { ok: true, outcome: "unknown" };
	if (claims.eventId !== eventId) return { ok: true, outcome: "other_event" };
	const version = await asUser(start.user, (tx) =>
		tx.event.findUnique({
			where: { id: eventId },
			select: { ticketKeyVersion: true },
		}),
	);
	if (!version) return { ok: false, message: "That event was not found." };
	if (version.ticketKeyVersion !== claims.version)
		return { ok: true, outcome: "reissued" };
	return admit(start.user, eventId, doorOf(doorId), "scan", (tx) =>
		tx.registration.findFirst({
			where: { id: claims.registrationId, eventId },
			select: FOUND,
		}),
	);
}

/** A ticket code typed in, for a pass that won't scan. */
export async function scanCode(
	eventId: string,
	typed: string,
	doorId?: string | null,
): Promise<ScanResult> {
	const start = await ready(eventId);
	if (!start.ok) return start;
	const code = typeof typed === "string" ? readTicketCode(typed) : null;
	if (!code)
		return {
			ok: false,
			message: "That isn't a ticket code. It looks like MME-7K2Q-9F4B.",
		};
	return admit(start.user, eventId, doorOf(doorId), "manual", (tx) =>
		tx.registration.findFirst({
			where: { ticketCode: code, eventId },
			select: FOUND,
		}),
	);
}

/** A guest picked from the list or the name lookup, or just added. */
export async function checkInGuest(
	eventId: string,
	registrationId: string,
	doorId?: string | null,
): Promise<ScanResult> {
	const start = await ready(eventId);
	if (!start.ok) return start;
	if (!recordId.safeParse(registrationId).success)
		return { ok: true, outcome: "unknown" };
	return admit(start.user, eventId, doorOf(doorId), "manual", (tx) =>
		tx.registration.findFirst({
			where: { id: registrationId, eventId },
			select: FOUND,
		}),
	);
}

/**
 * Today's door: how many are in, of how many with a place. Asked by every
 * open scanner every few seconds, so it's worked out once per few seconds
 * per event (door-count.ts), after this person's own read of the event
 * shows they may see it.
 */
export async function doorCount(eventId: string): Promise<DoorCount | null> {
	// Asked every few seconds in the background: signed out, it answers
	// nothing rather than sending the scanner to sign in. A scan does that.
	const user = await getCurrentUser();
	if (!user || !recordId.safeParse(eventId).success) return null;
	return asUser(user, async (tx) => {
		// Reads the event under row-level security: not on its team, not found.
		const day = await checkInDay(tx, eventId);
		if (day.ok) return doorCountFor(tx, eventId, day.dayId);
		const found = await tx.event.count({ where: { id: eventId } });
		if (!found) return null;
		// Not a day the event runs: no one is in today.
		const tickets = await tx.ticketType.findMany({
			where: { eventId },
			select: { registeredCount: true },
		});
		return {
			in: 0,
			of: tickets.reduce((sum, t) => sum + Number(t.registeredCount), 0),
		};
	});
}

/** Where the next page starts: opaque to the phone, checked on return. */
type After =
	| { by: "name"; name: string; id: string }
	| { by: "in"; checkIn: bigint };

function afterOf(value: unknown, filter: DoorFilter): After | null {
	if (typeof value !== "string" || value.length > 400) return null;
	if (filter === "in")
		return /^\d{1,19}$/.test(value)
			? { by: "in", checkIn: BigInt(value) }
			: null;
	try {
		const read: unknown = JSON.parse(value);
		if (
			typeof read === "object" &&
			read !== null &&
			typeof (read as { n?: unknown }).n === "string" &&
			(read as { n: string }).n.length <= 300 &&
			recordId.safeParse((read as { i?: unknown }).i).success
		)
			return {
				by: "name",
				name: (read as { n: string }).n,
				id: (read as { i: string }).i,
			};
	} catch {
		// Not one of ours: from the start.
	}
	return null;
}

/**
 * The door's guest list: everyone with a place, or those in today (latest
 * first), or those not yet in; by name or ticket code. Names match anywhere
 * (the trigram index on attendee_name); a code from its start.
 *
 * A page at a time, each starting after the last row shown (`after`, from
 * the page before's `next`), on the (event, name, id) and (event, day, id)
 * indexes: a page costs the same however far down it is and however many
 * guests the event has. `take` re-reads what's on screen in one go.
 */
export async function doorGuests(
	eventId: string,
	options: {
		filter?: DoorFilter;
		query?: string;
		after?: string | null;
		take?: number;
	},
): Promise<{ guests: DoorGuest[]; next: string | null } | null> {
	const user = await getCurrentUser();
	if (!user || !recordId.safeParse(eventId).success) return null;
	const filter: DoorFilter =
		options.filter === "in" || options.filter === "out"
			? options.filter
			: "all";
	const query =
		typeof options.query === "string"
			? options.query.replace(/\s+/g, " ").trim().slice(0, 80)
			: "";
	const take =
		Number.isInteger(options.take) && (options.take ?? 0) > 0
			? Math.min(options.take ?? PAGE, TAKE_MAX)
			: PAGE;
	const after = afterOf(options.after, filter);
	const code = query.replace(/[\s-]/g, "").toUpperCase();
	const matches: Prisma.RegistrationWhereInput[] = query
		? [
				{ attendeeName: { contains: query, mode: "insensitive" } },
				...(code.length >= 4
					? [
							{
								ticketCode: {
									startsWith: `MME-${code.replace(/^MME/, "").slice(0, 4)}`,
								},
							},
						]
					: []),
			]
		: [];

	return asUser(user, async (tx) => {
		const day = await checkInDay(tx, eventId);
		const dayId = day.ok ? day.dayId : null;
		const select = {
			id: true,
			attendeeName: true,
			ticketCode: true,
			ticketType: { select: { name: true } },
			checkIns: {
				where: { eventDayId: dayId },
				select: {
					checkedInAt: true,
					door: { select: { name: true } },
					by: { select: { displayName: true } },
				},
				take: 1,
			},
		} as const;
		type Row = Prisma.RegistrationGetPayload<{ select: typeof select }>;

		let rows: Row[];
		let next: string | null = null;
		if (filter === "in") {
			// Latest in first: today's check-ins, newest id first.
			const ins = await tx.checkIn.findMany({
				where: {
					eventId,
					eventDayId: dayId,
					...(after?.by === "in" ? { id: { lt: after.checkIn } } : {}),
					registration: {
						status: "confirmed",
						...(matches.length ? { OR: matches } : {}),
					},
				},
				orderBy: { id: "desc" },
				take: take + 1,
				select: { id: true, registration: { select } },
			});
			const last = ins[take - 1];
			if (ins.length > take && last) next = last.id.toString();
			rows = ins.slice(0, take).map((c) => c.registration);
		} else {
			const found = await tx.registration.findMany({
				where: {
					eventId,
					status: "confirmed",
					...(matches.length ? { OR: matches } : {}),
					...(filter === "out"
						? { checkIns: { none: { eventDayId: dayId } } }
						: {}),
					// After the last row shown: its name or later, and past
					// it among those with the same name. The first half lets
					// the index start there rather than at the top.
					...(after?.by === "name"
						? {
								AND: [
									{ attendeeName: { gte: after.name } },
									{
										OR: [
											{ attendeeName: { gt: after.name } },
											{ id: { gt: after.id } },
										],
									},
								],
							}
						: {}),
				},
				orderBy: [{ attendeeName: "asc" }, { id: "asc" }],
				take: take + 1,
				select,
			});
			const last = found[take - 1];
			if (found.length > take && last)
				next = JSON.stringify({ n: last.attendeeName, i: last.id });
			rows = found.slice(0, take);
		}
		return {
			next,
			guests: rows.map((r) => {
				const checked = r.checkIns[0];
				return {
					id: r.id,
					name: r.attendeeName,
					ticket: r.ticketType.name,
					code: r.ticketCode,
					in: checked
						? {
								at: checked.checkedInAt.toISOString(),
								by: checked.by?.displayName ?? null,
								door: checked.door?.name ?? null,
							}
						: null,
				};
			}),
		};
	});
}
