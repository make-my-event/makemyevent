"use server";

import {
	BLOCKLIST_LIMIT,
	type ContactKind,
	normalizeContact,
	recordId,
	splitContacts,
} from "@makemyevent/core";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { actingUser } from "@/lib/require-user";

/**
 * The blocklist's writes, as the person signed in: those who manage the
 * event, under row-level security. Each change saves at once.
 */

export type BlockResult =
	| {
			ok: true;
			added: number;
			/** Entries already on the list, left as they were. */
			already: number;
			/** Guests who already have a place with a blocked email or number. */
			registered: string[];
	  }
	| { ok: false; message: string };

const NOT_ALLOWED =
	"You can't change this event's blocklist. Ask its owner or an admin for the Organizer role.";

/** Blocks one or many, as pasted. All or none: one bad entry stops the rest. */
export async function blockContacts(
	eventId: string,
	kind: ContactKind,
	text: string,
): Promise<BlockResult> {
	const user = await actingUser();
	if (
		!recordId.safeParse(eventId).success ||
		(kind !== "email" && kind !== "phone")
	)
		return { ok: false, message: NOT_ALLOWED };
	const entries = splitContacts(String(text ?? ""));
	if (entries.length === 0)
		return {
			ok: false,
			message:
				kind === "email" ? "Enter an email address." : "Enter a phone number.",
		};
	const values: string[] = [];
	for (const entry of entries) {
		const normalized = normalizeContact(kind, entry);
		if (!normalized.ok) return { ok: false, message: normalized.message };
		values.push(normalized.value);
	}
	const unique = [...new Set(values)];

	const slow = await limited("guest.block", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	try {
		const result = await asUser(user, async (tx) => {
			const held = await tx.blockedContact.count({ where: { eventId, kind } });
			if (held + unique.length > BLOCKLIST_LIMIT)
				return {
					ok: false,
					message: `A blocklist holds up to ${BLOCKLIST_LIMIT} ${kind === "email" ? "emails" : "numbers"}.`,
				} as const;
			const { count } = await tx.blockedContact.createMany({
				data: unique.map((value) => ({ eventId, kind, value })),
				skipDuplicates: true,
			});
			// Who's already in: blocking stops new places, not existing ones.
			const registered =
				kind === "email"
					? await tx.registration.findMany({
							where: {
								eventId,
								status: { not: "cancelled" },
								attendeeEmail: { in: unique },
							},
							select: { attendeeName: true },
						})
					: // A phone is an answer: its text, compared as stored (+digits).
						await tx.$queryRaw<{ attendeeName: string }[]>`
							SELECT DISTINCT r.attendee_name AS "attendeeName"
							FROM registrations r
							JOIN registration_answers a ON a.registration_id = r.id
							WHERE r.event_id = ${eventId}::uuid
								AND r.status <> 'cancelled'
								AND jsonb_typeof(a.value) = 'string'
								AND a.value #>> '{}' = ANY(${unique}::text[])
						`;
			return {
				ok: true,
				added: count,
				already: unique.length - count,
				registered: registered.map((r) => r.attendeeName),
			} as const;
		});
		if (result.ok) revalidatePath("/dashboard/[event]/guests", "layout");
		return result;
	} catch (error) {
		if (
			error instanceof Error &&
			/row-level security|permission denied/.test(error.message)
		)
			return { ok: false, message: NOT_ALLOWED };
		throw error;
	}
}

/** Takes one off the list. */
export async function unblockContact(
	eventId: string,
	id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const user = await actingUser();
	if (!recordId.safeParse(eventId).success || !/^\d{1,18}$/.test(id))
		return { ok: false, message: NOT_ALLOWED };

	const slow = await limited("guest.block", { user: user.id });
	if (slow) return { ok: false, message: slow.message };
	const { count } = await asUser(user, (tx) =>
		tx.blockedContact.deleteMany({ where: { id: BigInt(id), eventId } }),
	);
	revalidatePath("/dashboard/[event]/guests", "layout");
	return count === 0
		? { ok: false, message: "That entry was already removed." }
		: { ok: true };
}
