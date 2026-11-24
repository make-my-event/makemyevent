import "server-only";
import {
	type Answer,
	answerText,
	FIELD_KIND_INFO,
	type FieldSettings,
	GUEST_PAGE_SIZE,
	type GuestCursor,
	type GuestQuery,
	isFieldKind,
	ticketCodeSearch,
} from "@makemyevent/core";
import type { Prisma, Tx } from "@makemyevent/db";

/** Guests the list shows: everyone with a place or waiting for one. */
const LISTED = ["confirmed", "waitlisted"];

export type GuestRow = {
	id: string;
	name: string;
	email: string;
	ticketTypeId: string;
	ticketCode: string;
	source: string;
	status: string;
	registeredAt: Date;
	checkedInAt: Date | null;
	/** Answers by field id, as words, for the optional columns. */
	answers: Record<string, string>;
};

export type GuestColumn = { id: string; label: string };

export type GuestPage = {
	rows: GuestRow[];
	/** Matching guests in all, for "1–50 of 312". */
	total: number;
	/** Where the next page starts; null on the last page. */
	next: GuestCursor | null;
};

/** The list's filter, for a page here and for Export. */
export function guestWhere(
	eventId: string,
	query: GuestQuery,
): Prisma.RegistrationWhereInput {
	const and: Prisma.RegistrationWhereInput[] = [
		query.cancelled
			? { eventId, status: "cancelled" }
			: { eventId, status: { in: LISTED } },
	];
	if (query.q) {
		const code = ticketCodeSearch(query.q);
		and.push({
			OR: [
				{ attendeeName: { contains: query.q, mode: "insensitive" } },
				{ attendeeEmail: { contains: query.q.toLowerCase() } },
				...(code ? [{ ticketCode: code }] : []),
			],
		});
	}
	if (query.ticket) and.push({ ticketTypeId: query.ticket });
	if (query.source !== "all") and.push({ source: query.source });
	if (query.checked === "in") and.push({ checkIns: { some: {} } });
	if (query.checked === "out") and.push({ checkIns: { none: {} } });
	return { AND: and };
}

/**
 * One page of the list, newest first, keyset-paged on the
 * (event_id, created_at DESC, id DESC) index: the cost of a page does not
 * grow with how far into the list it is. Name and email searches use the
 * trigram indexes; a ticket code, its unique key.
 */
export async function guestPage(
	tx: Tx,
	eventId: string,
	query: GuestQuery,
	fields: readonly { id: string; kind: string; settings: unknown }[],
): Promise<GuestPage> {
	const filter = guestWhere(eventId, query);
	const after = query.after;
	const [rows, total] = await Promise.all([
		tx.registration.findMany({
			where: after
				? {
						AND: [
							filter,
							{
								OR: [
									{ createdAt: { lt: after.at } },
									{ createdAt: after.at, id: { lt: after.id } },
								],
							},
						],
					}
				: filter,
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: GUEST_PAGE_SIZE + 1,
			select: {
				id: true,
				attendeeName: true,
				attendeeEmail: true,
				ticketTypeId: true,
				ticketCode: true,
				source: true,
				status: true,
				createdAt: true,
				checkIns: {
					orderBy: { checkedInAt: "desc" },
					take: 1,
					select: { checkedInAt: true },
				},
				answers: {
					select: { fieldId: true, value: true, otherText: true },
				},
			},
		}),
		tx.registration.count({ where: filter }),
	]);

	// What answerText needs of each question: its kind and its options.
	// Written through checkForm, so their shape is the form's own.
	const byId = new Map(
		fields.flatMap((field) =>
			isFieldKind(field.kind)
				? [
						[
							field.id,
							{ kind: field.kind, settings: field.settings as FieldSettings },
						] as const,
					]
				: [],
		),
	);
	const page = rows.slice(0, GUEST_PAGE_SIZE);
	const last = page[page.length - 1];
	return {
		rows: page.map((row) => ({
			id: row.id,
			name: row.attendeeName,
			email: row.attendeeEmail,
			ticketTypeId: row.ticketTypeId,
			ticketCode: row.ticketCode,
			source: row.source,
			status: row.status,
			registeredAt: row.createdAt,
			checkedInAt: row.checkIns[0]?.checkedInAt ?? null,
			answers: Object.fromEntries(
				row.answers.flatMap((answer) => {
					const field = byId.get(answer.fieldId);
					if (!field) return [];
					const text = answerText(
						field,
						answer.value as Answer,
						answer.otherText,
					);
					return text ? [[answer.fieldId, text]] : [];
				}),
			),
		})),
		total,
		next:
			rows.length > GUEST_PAGE_SIZE && last
				? { at: last.createdAt, id: last.id }
				: null,
	};
}

/** The questions that can be a column: every answered kind, not name or email. */
export function columnsOf(
	fields: readonly {
		id: string;
		kind: string;
		core: string | null;
		label: string;
	}[],
): GuestColumn[] {
	return fields
		.filter(
			(field) =>
				!field.core &&
				isFieldKind(field.kind) &&
				FIELD_KIND_INFO[field.kind].answers,
		)
		.map((field) => ({ id: field.id, label: field.label }));
}
