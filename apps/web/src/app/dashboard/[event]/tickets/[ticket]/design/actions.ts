"use server";

import { type PassDesign, passDesign, recordId } from "@makemyevent/core";
import { Prisma, type Tx } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { actingUser } from "@/lib/require-user";

/**
 * Saving a ticket's pass design, as the person signed in, under row-level
 * security: those who manage the event. passDesign checks it whole first;
 * the database holds the outline again (ticket_designs migration).
 */

export type DesignResult =
	| { ok: true; count: number }
	| { ok: false; message: string };

const NOT_ALLOWED =
	"You can't change this event's tickets. Ask its owner or an admin for the Organizer role.";
const NOT_READ =
	"That design could not be saved. Reload the page and try again.";

function refresh() {
	revalidatePath("/dashboard/[event]/tickets", "page");
	revalidatePath("/dashboard/[event]/tickets/[ticket]/design", "page");
	revalidatePath("/dashboard/[event]/guests", "page");
}

function failure(error: unknown): DesignResult | null {
	const text = error instanceof Error ? error.message : "";
	if (/row-level security|permission denied/.test(text))
		return { ok: false, message: NOT_ALLOWED };
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2003"
	)
		return { ok: false, message: "That ticket was not found." };
	if (/ticket_designs_/.test(text)) return { ok: false, message: NOT_READ };
	return null;
}

async function write(
	tx: Tx,
	eventId: string,
	ticketId: string,
	design: PassDesign,
): Promise<void> {
	const data = {
		base: design.base,
		accent: design.accent,
		layers: design.layers as Prisma.InputJsonValue,
	};
	await tx.ticketDesign.upsert({
		where: { ticketTypeId: ticketId },
		create: { ticketTypeId: ticketId, eventId, ...data },
		update: data,
	});
}

/** Checks the call; the design, or the words to say why not. */
async function prepare(
	eventId: string,
	ticketId: string,
	raw: unknown,
): Promise<
	| {
			ok: true;
			design: PassDesign;
			user: Awaited<ReturnType<typeof actingUser>>;
	  }
	| { ok: false; message: string }
> {
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(ticketId).success
	)
		return { ok: false, message: "That ticket was not found." };
	const parsed = passDesign.safeParse(raw);
	if (!parsed.success)
		return {
			ok: false,
			message: parsed.error.issues[0]?.message ?? NOT_READ,
		};
	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	return { ok: true, design: parsed.data, user };
}

/** This ticket's design, saved whole. */
export async function saveDesign(
	eventId: string,
	ticketId: string,
	raw: unknown,
): Promise<DesignResult> {
	const ready = await prepare(eventId, ticketId, raw);
	if (!ready.ok) return ready;
	try {
		await asUser(ready.user, (tx) =>
			write(tx, eventId, ticketId, ready.design),
		);
		refresh();
		return { ok: true, count: 1 };
	} catch (error) {
		const result = failure(error);
		if (result) return result;
		throw error;
	}
}

/**
 * The same design on every ticket of the event, this one included, in one
 * transaction: all of them change, or none.
 */
export async function applyDesignToAll(
	eventId: string,
	ticketId: string,
	raw: unknown,
): Promise<DesignResult> {
	const ready = await prepare(eventId, ticketId, raw);
	if (!ready.ok) return ready;
	try {
		const count = await asUser(ready.user, async (tx) => {
			const tickets = await tx.ticketType.findMany({
				where: { eventId },
				select: { id: true },
			});
			if (!tickets.some((t) => t.id === ticketId)) return 0;
			for (const t of tickets) await write(tx, eventId, t.id, ready.design);
			return tickets.length;
		});
		if (count === 0)
			return { ok: false, message: "That ticket was not found." };
		refresh();
		return { ok: true, count };
	} catch (error) {
		const result = failure(error);
		if (result) return result;
		throw error;
	}
}
