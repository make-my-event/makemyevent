import "server-only";
import type { Tx } from "@makemyevent/db";
import { forget, remembered } from "@/lib/shared-cache";

/**
 * Today's "X / Y in", shared by every phone at the event's doors: worked
 * out from the database at most once per few seconds per event (CLAUDE.md:
 * counts from Redis, 2–5 s, never a live count per screen), and forgotten
 * the moment a check-in is made or undone here, so the phone that did it
 * sees its own change at once.
 */

export type DoorCount = { in: number; of: number };

const TTL_MS = 3000;
const keyOf = (eventId: string) => `door-count:${eventId}`;

type Stored = { day: string; in: number; of: number };

/**
 * The count for `day` (an event day's id, or null for an event without
 * days). Call only inside the person's own transaction, after it has shown
 * they may see this event: the cache doesn't know who asks.
 */
export function doorCountFor(
	tx: Tx,
	eventId: string,
	day: bigint | null,
): Promise<DoorCount> {
	const dayKey = day === null ? "all" : day.toString();
	return remembered(
		keyOf(eventId),
		TTL_MS,
		(s): s is Stored =>
			typeof s === "object" &&
			s !== null &&
			(s as Stored).day === dayKey &&
			Number.isSafeInteger((s as Stored).in) &&
			Number.isSafeInteger((s as Stored).of),
		async () => {
			const [inside, tickets] = await Promise.all([
				tx.checkIn.count({ where: { eventId, eventDayId: day } }),
				tx.ticketType.findMany({
					where: { eventId },
					select: { registeredCount: true },
				}),
			]);
			return {
				day: dayKey,
				in: inside,
				of: tickets.reduce((sum, t) => sum + Number(t.registeredCount), 0),
			};
		},
	).then(({ in: inside, of }) => ({ in: inside, of }));
}

/** After a check-in is made or undone: the next read counts again. */
export function forgetDoorCount(eventId: string): Promise<void> {
	return forget(keyOf(eventId));
}
