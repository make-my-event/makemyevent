import "server-only";
import { utcToZoned } from "@makemyevent/core";
import type { Tx } from "@makemyevent/db";

/**
 * Which event day a check-in now counts for: today, on the event's own
 * clock. An event without days has one check-in in all (null). Checking in
 * on a day the event doesn't run is refused, so a pass can't be used up on
 * the wrong day.
 */
export async function checkInDay(
	tx: Tx,
	eventId: string,
): Promise<
	{ ok: true; dayId: bigint | null } | { ok: false; message: string }
> {
	const event = await tx.event.findUnique({
		where: { id: eventId },
		select: { timeZone: true, days: { select: { id: true, day: true } } },
	});
	if (!event) return { ok: false, message: "That event was not found." };
	if (event.days.length === 0) return { ok: true, dayId: null };
	const date = utcToZoned(new Date(), event.timeZone ?? "UTC").date;
	const match = event.days.find(
		(d) => d.day.toISOString().slice(0, 10) === date,
	);
	return match
		? { ok: true, dayId: match.id }
		: {
				ok: false,
				message: "The event doesn't run today, so no one can check in yet.",
			};
}
