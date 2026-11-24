import "server-only";
import { type FieldSettings, OTHER_OPTION } from "@makemyevent/core";
import type { Tx } from "@makemyevent/db";
import type { ChoiceSplit } from "./overview/glance-data";

/**
 * Registrations per answer to the form's first single-choice question
 * (Profession, on a new event), for the Summary's bar when the event has
 * one ticket. Null when the form asks no such question.
 *
 * Two indexed reads under the viewer's role: the question, then one row
 * per answer given (registration_answers by field_id, joined to the
 * registration's primary key). Cancelled registrations don't count, as
 * they don't in the total.
 */
export async function choiceSplit(
	tx: Tx,
	eventId: string,
	registered: number,
): Promise<ChoiceSplit | null> {
	const field = await tx.formField.findFirst({
		where: {
			eventId,
			archivedAt: null,
			kind: { in: ["select", "radio"] },
		},
		orderBy: { position: "asc" },
		select: { id: true, label: true, settings: true },
	});
	if (!field) return null;

	const rows = await tx.$queryRaw<{ value: unknown; n: bigint }[]>`
		select a.value, count(*) as n
		from registration_answers a
		join registrations r on r.id = a.registration_id and r.event_id = a.event_id
		where a.field_id = ${field.id}::uuid and r.status <> 'cancelled'
		group by a.value`;

	const given = new Map<string, number>();
	for (const row of rows)
		if (typeof row.value === "string")
			given.set(row.value, (given.get(row.value) ?? 0) + Number(row.n));

	const options = (field.settings as FieldSettings | null)?.options ?? [];
	const answers = options.map((option) => ({
		id: option.id,
		name: option.label,
		registered: given.get(option.id) ?? 0,
	}));
	const other = given.get(OTHER_OPTION) ?? 0;
	if (other > 0)
		answers.push({ id: OTHER_OPTION, name: "Other", registered: other });
	const answered = answers.reduce((sum, a) => sum + a.registered, 0);
	// Guests added before the question existed, or who skipped it.
	if (registered > answered)
		answers.push({
			id: "",
			name: "No answer",
			registered: registered - answered,
		});
	return { label: field.label, answers };
}
