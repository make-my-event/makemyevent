"use server";

import { recordId } from "@makemyevent/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/identity";

export type DeleteEventResult = { ok: true } | { ok: false; message: string };

/**
 * Deletes a draft event, for good: its tickets, invites and team go with it.
 *
 * Runs as the person signed in, under row-level security, which allows it
 * only to the event's owner and only while it is a draft. A published event
 * has people holding tickets; it is cancelled, never deleted, and the
 * database refuses whatever this code is sent. A refusal reads as nothing
 * deleted.
 */
export async function deleteEvent(eventId: string): Promise<DeleteEventResult> {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fdashboard");
	if (!recordId.safeParse(eventId).success)
		return { ok: false, message: "That event was not found." };

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };

	const { count } = await asUser(user.id, (tx) =>
		tx.event.deleteMany({ where: { id: eventId } }),
	);
	if (count === 0)
		return {
			ok: false,
			message:
				"Only the owner can delete an event, and only while it is a draft.",
		};

	revalidatePath("/dashboard");
	return { ok: true };
}
