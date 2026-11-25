import {
	type Answer,
	answerText,
	csvLine,
	type FieldSettings,
	isFieldKind,
	readGuestQuery,
} from "@makemyevent/core";
import { BULK_LIMITS } from "@makemyevent/db";
import { asUser } from "@/lib/db";
import { loadManagedEvent } from "../../load-event";
import { exactTime } from "../../overview/time-ago";
import { guestWhere } from "../guests-data";

type ExportRow = {
	id: string;
	attendeeName: string;
	attendeeEmail: string;
	ticketTypeId: string;
	ticketCode: string;
	status: string;
	source: string;
	createdAt: Date;
	checkIns: { checkedInAt: Date }[];
	answers: { fieldId: string; value: unknown; otherText: string | null }[];
};

/** Seconds this route may run: BULK_LIMITS and room to send the file. */
export const maxDuration = 60;

/** Far beyond any event; one export never reads more. */
const EXPORT_LIMIT = 50_000;
const CHUNK = 1000;

const STATUS: Record<string, string> = {
	confirmed: "Confirmed",
	waitlisted: "Waitlist",
	cancelled: "Cancelled",
};
const SOURCE: Record<string, string> = {
	self: "Registered",
	invite: "Invited",
	bulk: "Imported",
};

/**
 * The guest list as CSV: the list's current search and filters, every
 * guest they match, with their answers. Only those who manage the event
 * may export (it is personal data leaving the product), and every export
 * is written to the audit log, in the same transaction that reads it.
 *
 * Cells that a spreadsheet would run as a formula are written as text
 * (csvCell), and the file starts with a byte-order mark so Excel reads it
 * as UTF-8.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ event: string }> },
) {
	const { event: slug } = await params;
	const event = await loadManagedEvent(slug, "guests");
	if (event.role === "volunteer")
		return new Response("Only those who manage the event can export guests.", {
			status: 403,
		});
	const query = readGuestQuery(
		Object.fromEntries(new URL(request.url).searchParams),
	);
	const filter = guestWhere(event.id, { ...query, after: null });

	const body = await asUser(
		event.viewerId,
		async (tx) => {
			const fields = (
				await tx.formField.findMany({
					where: { eventId: event.id, archivedAt: null, core: null },
					orderBy: { position: "asc" },
					select: { id: true, kind: true, label: true, settings: true },
				})
			).filter((f) => isFieldKind(f.kind) && f.kind !== "heading");
			const tickets = new Map(event.ticketTypes.map((t) => [t.id, t.name]));

			let csv = `﻿${csvLine([
				"Name",
				"Email",
				"Ticket",
				"Ticket code",
				"Status",
				"Joined by",
				"Registered",
				"Checked in",
				...fields.map((f) => f.label),
			])}`;
			let count = 0;
			let after: { at: Date; id: string } | null = null;
			while (count < EXPORT_LIMIT) {
				const cursor: { at: Date; id: string } | null = after;
				const rows: ExportRow[] = await tx.registration.findMany({
					where: cursor
						? {
								AND: [
									filter,
									{
										OR: [
											{ createdAt: { lt: cursor.at } },
											{ createdAt: cursor.at, id: { lt: cursor.id } },
										],
									},
								],
							}
						: filter,
					orderBy: [{ createdAt: "desc" }, { id: "desc" }],
					take: CHUNK,
					select: {
						id: true,
						attendeeName: true,
						attendeeEmail: true,
						ticketTypeId: true,
						ticketCode: true,
						status: true,
						source: true,
						createdAt: true,
						checkIns: {
							orderBy: { checkedInAt: "asc" },
							take: 1,
							select: { checkedInAt: true },
						},
						answers: {
							select: { fieldId: true, value: true, otherText: true },
						},
					},
				});
				for (const row of rows) {
					const answers = new Map(row.answers.map((a) => [a.fieldId, a]));
					const checked = row.checkIns[0]?.checkedInAt;
					csv += csvLine([
						row.attendeeName,
						row.attendeeEmail,
						tickets.get(row.ticketTypeId) ?? "",
						row.ticketCode,
						STATUS[row.status] ?? row.status,
						SOURCE[row.source] ?? row.source,
						exactTime(row.createdAt, event.timeZone),
						checked ? exactTime(checked, event.timeZone) : "",
						...fields.map((field) => {
							const answer = answers.get(field.id);
							return answer && isFieldKind(field.kind)
								? answerText(
										{
											kind: field.kind,
											settings: field.settings as FieldSettings,
										},
										answer.value as Answer,
										answer.otherText,
									)
								: "";
						}),
					]);
				}
				count += rows.length;
				const last = rows[rows.length - 1];
				if (rows.length < CHUNK || !last) break;
				after = { at: last.createdAt, id: last.id };
			}
			await tx.auditLog.create({
				data: {
					eventId: event.id,
					action: "guests.export",
					details: {
						count,
						filters: {
							q: query.q || null,
							ticket: query.ticket,
							checked: query.checked,
							source: query.source,
							cancelled: query.cancelled,
						},
					},
				},
			});
			return csv;
		},
		BULK_LIMITS,
	);

	const date = new Date().toISOString().slice(0, 10);
	// Streamed: the host caps a response sent whole at 4.5 MB, and a big
	// event's list is larger.
	return new Response(new Blob([body]).stream(), {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${slug}-guests-${date}.csv"`,
			"Cache-Control": "no-store",
		},
	});
}
