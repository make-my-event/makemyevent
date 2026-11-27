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

/**
 * The door: a scanned pass, or a typed ticket code, checked by the server
 * and let in under row-level security, as the person scanning (anyone on
 * the team). The pass's signature, its event and its key version are
 * checked here; the guest's state and their ticket's days by the database.
 * One check-in per guest per day, so two doors scanning one person at once
 * get one "Admitted" and one "Already in".
 */

export type ScanResult =
	| {
			ok: true;
			outcome: ScanOutcome;
			/** For admitted and already in. */
			guest?: { id: string; name: string; ticket: string };
			/** For admitted: when, by the database's clock. */
			at?: string;
			/** For already in: when, and by whom. */
			earlier?: { at: string; by: string | null };
	  }
	| { ok: false; message: string };

export type DoorCount = { in: number; of: number };

const NO_KEY =
	"Passes aren't set up on this site yet. It needs TICKET_SIGNING_KEY.";

type Found = {
	id: string;
	attendeeName: string;
	status: string;
	ticketType: { name: string };
};

const FOUND = {
	id: true,
	attendeeName: true,
	status: true,
	ticketType: { select: { name: true } },
} as const;

async function earlierCheckIn(
	tx: Tx,
	registrationId: string,
	dayId: bigint | null,
) {
	const row = await tx.checkIn.findFirst({
		where: { registrationId, eventDayId: dayId },
		select: { checkedInAt: true, by: { select: { displayName: true } } },
	});
	return row
		? { at: row.checkedInAt.toISOString(), by: row.by?.displayName ?? null }
		: null;
}

/** Lets one found guest in, or says why not. */
async function admit(
	user: Awaited<ReturnType<typeof actingUser>>,
	eventId: string,
	find: (tx: Tx) => Promise<Found | null>,
): Promise<ScanResult> {
	let result: ScanResult;
	try {
		result = await asUser(user, async (tx): Promise<ScanResult> => {
			const guest = await find(tx);
			if (!guest) return { ok: true, outcome: "unknown" };
			const who = {
				id: guest.id,
				name: guest.attendeeName,
				ticket: guest.ticketType.name,
			};
			if (guest.status === "cancelled")
				return { ok: true, outcome: "cancelled", guest: who };
			if (guest.status !== "confirmed")
				return { ok: true, outcome: "waitlisted", guest: who };
			const day = await checkInDay(tx, eventId);
			if (!day.ok) return { ok: true, outcome: "not_running" };
			const earlier = await earlierCheckIn(tx, guest.id, day.dayId);
			if (earlier)
				return { ok: true, outcome: "already_in", guest: who, earlier };
			const made = await tx.checkIn.create({
				data: {
					registrationId: guest.id,
					eventId,
					eventDayId: day.dayId,
					method: "scan",
				},
				select: { checkedInAt: true },
			});
			return {
				ok: true,
				outcome: "admitted",
				guest: who,
				at: made.checkedInAt.toISOString(),
			};
		});
	} catch (error) {
		const said = error instanceof Error ? error.message : "";
		// Their ticket's own days (the tickets migration).
		if (/one entry used/.test(said))
			return { ok: true, outcome: "used_elsewhere" };
		if (/not this day/.test(said)) return { ok: true, outcome: "not_today" };
		// Another door let them in a moment ago: say who, from a fresh read.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		)
			return asUser(user, async (tx) => {
				const guest = await find(tx);
				const day = await checkInDay(tx, eventId);
				if (!guest || !day.ok) return { ok: true, outcome: "unknown" } as const;
				const earlier = await earlierCheckIn(tx, guest.id, day.dayId);
				return {
					ok: true,
					outcome: "already_in",
					guest: {
						id: guest.id,
						name: guest.attendeeName,
						ticket: guest.ticketType.name,
					},
					...(earlier ? { earlier } : {}),
				} as const;
			});
		if (/row-level security|permission denied/.test(said))
			return { ok: false, message: "You can't let guests in at this event." };
		throw error;
	}
	if (result.ok && result.outcome === "admitted")
		revalidatePath("/dashboard/[event]/guests", "page");
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
	return admit(start.user, eventId, (tx) =>
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
): Promise<ScanResult> {
	const start = await ready(eventId);
	if (!start.ok) return start;
	const code = typeof typed === "string" ? readTicketCode(typed) : null;
	if (!code)
		return {
			ok: false,
			message: "That isn't a ticket code. It looks like MME-7K2Q-9F4B.",
		};
	return admit(start.user, eventId, (tx) =>
		tx.registration.findFirst({
			where: { ticketCode: code, eventId },
			select: FOUND,
		}),
	);
}

/**
 * Today's door: how many are in, of how many with a place. The places are
 * kept counts on the tickets; the check-ins are one indexed count of today.
 */
export async function doorCount(eventId: string): Promise<DoorCount | null> {
	// Asked every few seconds in the background: signed out, it answers
	// nothing rather than sending the scanner to sign in. A scan does that.
	const user = await getCurrentUser();
	if (!user || !recordId.safeParse(eventId).success) return null;
	return asUser(user, async (tx) => {
		const day = await checkInDay(tx, eventId);
		const [inside, tickets] = await Promise.all([
			// Not a day the event runs: no one is in today.
			day.ok
				? tx.checkIn.count({ where: { eventId, eventDayId: day.dayId } })
				: 0,
			tx.ticketType.findMany({
				where: { eventId },
				select: { registeredCount: true },
			}),
		]);
		return {
			in: inside,
			of: tickets.reduce((sum, t) => sum + Number(t.registeredCount), 0),
		};
	});
}
