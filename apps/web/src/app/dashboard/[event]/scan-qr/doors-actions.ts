"use server";

import { recordId } from "@makemyevent/core";
import { Prisma, type Tx } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { actingUser } from "@/lib/require-user";

/**
 * Doors, for those who manage the event: the switch, the doors' names, and
 * which volunteer is held to which door. Every rule is the database's too
 * (the event_doors migration): at least two open doors while on, unique
 * names, volunteers only, open doors only. These turn its answers into
 * words.
 */

export type DoorResult = { ok: true } | { ok: false; message: string };

const NOT_ALLOWED =
	"You can't change this event's doors. Ask its owner or an admin for the Organizer role.";
const NAME_MAX = 40;

function refresh() {
	revalidatePath("/dashboard/[event]/scan-qr", "page");
}

/**
 * The database's own words for a refusal: Prisma keeps them on the driver's
 * error, and its message may not carry them (a unique violation becomes
 * P2002 with none).
 */
function said(error: unknown): string {
	if (!(error instanceof Error)) return "";
	const cause = (
		error as {
			meta?: { driverAdapterError?: { cause?: { message?: unknown } } };
		}
	).meta?.driverAdapterError?.cause?.message;
	return `${typeof cause === "string" ? cause : ""} ${error.message}`;
}

function failure(error: unknown): DoorResult | null {
	const text = said(error);
	if (
		/door name taken/.test(text) ||
		(error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002")
	)
		return { ok: false, message: "Another door already has that name." };
	if (/too many doors/.test(text))
		return { ok: false, message: "An event can have up to 20 doors." };
	if (/doors below two/.test(text))
		return {
			ok: false,
			message:
				"With doors on, the event needs at least two. Add another, or turn doors off first.",
		};
	if (/not a volunteer here/.test(text))
		return { ok: false, message: "Only volunteers can be held to a door." };
	if (/door not open/.test(text))
		return {
			ok: false,
			message: "That door was removed. Reload and try again.",
		};
	if (/doors off/.test(text))
		return { ok: false, message: "Turn doors on before assigning them." };
	if (/event_doors_name_length/.test(text))
		return {
			ok: false,
			message: `Give the door a name, up to ${NAME_MAX} characters.`,
		};
	if (/row-level security|permission denied/.test(text))
		return { ok: false, message: NOT_ALLOWED };
	return null;
}

async function run(
	eventId: string,
	work: (tx: Tx) => Promise<DoorResult>,
): Promise<DoorResult> {
	const user = await actingUser();
	if (!recordId.safeParse(eventId).success)
		return { ok: false, message: "That event was not found." };
	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	try {
		const result = await asUser(user, work);
		if (result.ok) refresh();
		return result;
	} catch (error) {
		const result = failure(error);
		if (result) return result;
		throw error;
	}
}

/** A door's name as typed: spaces tidied, 1 to 40 characters. */
function nameOf(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.replace(/\s+/g, " ").trim();
	return name && name.length <= NAME_MAX ? name : null;
}

/** "More than one door": on needs two open doors; off frees everyone. */
export async function setDoors(
	eventId: string,
	enabled: boolean,
): Promise<DoorResult> {
	return run(eventId, async (tx) => {
		const { count } = await tx.event.updateMany({
			where: { id: eventId },
			data: { doorsEnabled: enabled === true },
		});
		return count === 1 ? { ok: true } : { ok: false, message: NOT_ALLOWED };
	});
}

/** A new door at the end of the list. */
export async function addDoor(
	eventId: string,
	name: string,
): Promise<DoorResult> {
	const clean = nameOf(name);
	if (!clean)
		return {
			ok: false,
			message: `Give the door a name, up to ${NAME_MAX} characters.`,
		};
	return run(eventId, async (tx) => {
		const last = await tx.eventDoor.findFirst({
			where: { eventId, retiredAt: null },
			orderBy: { position: "desc" },
			select: { position: true },
		});
		await tx.eventDoor.create({
			data: {
				eventId,
				name: clean,
				position: Math.min(99, (last?.position ?? -1) + 1),
			},
		});
		return { ok: true };
	});
}

export async function renameDoor(
	eventId: string,
	doorId: string,
	name: string,
): Promise<DoorResult> {
	const clean = nameOf(name);
	if (!clean)
		return {
			ok: false,
			message: `Give the door a name, up to ${NAME_MAX} characters.`,
		};
	if (!recordId.safeParse(doorId).success)
		return { ok: false, message: "That door was not found." };
	return run(eventId, async (tx) => {
		const { count } = await tx.eventDoor.updateMany({
			where: { id: doorId, eventId, retiredAt: null },
			data: { name: clean },
		});
		return count === 1
			? { ok: true }
			: { ok: false, message: "That door was not found." };
	});
}

/**
 * Off the list. A door that has let anyone in is retired, so those
 * check-ins keep its name; one that hasn't is deleted. Either way its
 * volunteers go back to any door.
 */
export async function removeDoor(
	eventId: string,
	doorId: string,
): Promise<DoorResult> {
	if (!recordId.safeParse(doorId).success)
		return { ok: false, message: "That door was not found." };
	return run(eventId, async (tx) => {
		const used = await tx.checkIn.findFirst({
			where: { doorId, eventId },
			select: { id: true },
		});
		const { count } = used
			? await tx.eventDoor.updateMany({
					where: { id: doorId, eventId, retiredAt: null },
					data: { retiredAt: new Date() },
				})
			: await tx.eventDoor.deleteMany({ where: { id: doorId, eventId } });
		return count === 1
			? { ok: true }
			: { ok: false, message: "That door was not found." };
	});
}

/** Holds a volunteer to a door, or (null) lets them pick any. */
export async function assignDoor(
	eventId: string,
	memberId: string,
	doorId: string | null,
): Promise<DoorResult> {
	if (
		!recordId.safeParse(memberId).success ||
		(doorId !== null && !recordId.safeParse(doorId).success)
	)
		return {
			ok: false,
			message: "That couldn't be saved. Reload and try again.",
		};
	return run(eventId, async (tx) => {
		if (doorId === null) {
			await tx.doorAssignment.deleteMany({ where: { memberId, eventId } });
			return { ok: true };
		}
		await tx.doorAssignment.upsert({
			where: { memberId },
			create: { memberId, eventId, doorId },
			update: { doorId },
		});
		return { ok: true };
	});
}
