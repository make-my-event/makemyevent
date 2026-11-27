import "server-only";
import {
	answerText,
	defaultPassDesign,
	FIELD_KIND_INFO,
	type FormField,
	type PassDesign,
	type PassField,
	passDesign,
	readForm,
} from "@makemyevent/core";
import type { Tx } from "@makemyevent/db";
import { whereText } from "@/lib/event-text";

/**
 * What a pass prints about its event, in the event's own time zone: the
 * words every pass of the event shares.
 */
export function eventPassValues(event: {
	title: string;
	startsAt: Date | null;
	timeZone: string | null;
	format: string;
	venueName: string | null;
	venueAddress: string | null;
}): Pick<
	Record<PassField, string>,
	"event_title" | "event_date" | "event_time" | "venue"
> {
	const zone = event.timeZone ?? "UTC";
	return {
		event_title: event.title,
		event_date: event.startsAt
			? new Intl.DateTimeFormat("en-US", {
					timeZone: zone,
					weekday: "short",
					month: "short",
					day: "numeric",
					year: "numeric",
				}).format(event.startsAt)
			: "Date not set",
		event_time: event.startsAt
			? new Intl.DateTimeFormat("en-US", {
					timeZone: zone,
					hour: "numeric",
					minute: "2-digit",
				}).format(event.startsAt)
			: "",
		venue: whereText(event) ?? "",
	};
}

/** A saved design as the editor and passes use it; the default without one. */
export function designOf(
	row:
		| { base: string; accent: string | null; layers: unknown }
		| null
		| undefined,
): PassDesign {
	if (!row) return defaultPassDesign();
	const parsed = passDesign.safeParse(row);
	return parsed.success ? parsed.data : defaultPassDesign();
}

/** The form's questions that have answers worth printing. */
export async function passQuestions(
	tx: Tx,
	eventId: string,
): Promise<FormField[]> {
	const rows = await tx.formField.findMany({
		where: { eventId, archivedAt: null },
		orderBy: { position: "asc" },
		select: {
			id: true,
			kind: true,
			core: true,
			label: true,
			placeholder: true,
			help: true,
			required: true,
			settings: true,
			showIf: true,
		},
	});
	const read = readForm(rows);
	return read.ok
		? read.fields.filter(
				(f) =>
					FIELD_KIND_INFO[f.kind].answers &&
					f.kind !== "file" &&
					f.core !== "name",
			)
		: [];
}

/** One guest's answers to the questions a design prints, as words. */
export async function passAnswers(
	tx: Tx,
	registrationId: string,
	design: PassDesign,
	questions: FormField[],
): Promise<Record<string, string>> {
	const wanted = new Set(
		design.layers.flatMap((l) =>
			l.kind === "text" && l.source.type === "question"
				? [l.source.fieldId]
				: [],
		),
	);
	if (wanted.size === 0) return {};
	const rows = await tx.registrationAnswer.findMany({
		where: { registrationId, fieldId: { in: [...wanted] } },
		select: { fieldId: true, value: true, otherText: true },
	});
	const byId = new Map(questions.map((q) => [q.id, q]));
	const out: Record<string, string> = {};
	for (const row of rows) {
		const field = byId.get(row.fieldId);
		if (field)
			out[row.fieldId] = answerText(
				field,
				row.value as Parameters<typeof answerText>[1],
				row.otherText,
			);
	}
	return out;
}
