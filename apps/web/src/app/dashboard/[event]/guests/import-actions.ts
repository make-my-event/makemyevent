"use server";

import { randomUUID } from "node:crypto";
import {
	type FormField,
	IMPORT_ROW_LIMIT,
	IMPORT_TEXT_LIMIT,
	parseCsv,
	readForm,
	readImport,
	readSubmission,
	recordId,
	type StoredAnswer,
	sheetCsvUrl,
	utcToZoned,
} from "@makemyevent/core";
import { BULK_LIMITS, Prisma, type Tx } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/identity";

/**
 * Bulk upload: a CSV file's text, or a Google Sheet's link, read into the
 * form's questions, checked row by row with the same rules as a guest
 * registering, previewed, then the good rows added in one transaction.
 *
 * The import never trusts its preview: it reads and checks the file again.
 */

export type ImportSource =
	| { kind: "csv"; text: string }
	| { kind: "sheet"; url: string };

export type PreviewRow = {
	line: number;
	name: string;
	email: string;
	/** Null when the row will be added. */
	problem: string | null;
};

export type ImportPreview =
	| {
			ok: true;
			columns: { header: string; question: string | null }[];
			/** Required questions no column fills. */
			missing: string[];
			rows: PreviewRow[];
			good: number;
	  }
	| { ok: false; message: string };

export type ImportResult =
	| { ok: true; ids: string[]; skipped: number }
	| { ok: false; message: string; confirm?: boolean };

const NOT_ALLOWED =
	"You can't add guests to this event. Ask its owner or an admin for the Organizer role.";

async function signedIn() {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fdashboard");
	return user;
}

/** A body read no further than the limit, however long it claims to be. */
async function capped(
	response: Response,
	limit: number,
): Promise<string | null> {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const decoder = new TextDecoder();
	let text = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value, { stream: true });
		if (text.length > limit) {
			await reader.cancel();
			return null;
		}
	}
	return text + decoder.decode();
}

/**
 * A Google Sheet as CSV. Only docs.google.com's own export, following only
 * its redirect to googleusercontent.com, with a time limit and a size cap:
 * the server fetches nothing else, whatever link is pasted.
 */
async function fetchSheet(
	link: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
	const url = sheetCsvUrl(link);
	if (!url)
		return {
			ok: false,
			message:
				"Paste a Google Sheets link, like https://docs.google.com/spreadsheets/d/…",
		};
	const notShared = {
		ok: false as const,
		message:
			"That sheet isn't shared. In Google Sheets, Share → General access → Anyone with the link (Viewer), then try again.",
	};
	try {
		let response = await fetch(url, {
			redirect: "manual",
			signal: AbortSignal.timeout(10_000),
		});
		if (response.status >= 300 && response.status < 400) {
			const next = response.headers.get("location");
			if (!next) return notShared;
			const target = new URL(next, url);
			if (
				target.protocol !== "https:" ||
				!target.hostname.endsWith(".googleusercontent.com")
			)
				return notShared;
			response = await fetch(target, {
				redirect: "error",
				signal: AbortSignal.timeout(10_000),
			});
		}
		if (!response.ok) return notShared;
		if (!(response.headers.get("content-type") ?? "").includes("text/csv"))
			return notShared;
		const text = await capped(response, IMPORT_TEXT_LIMIT);
		if (text === null)
			return {
				ok: false,
				message: "That sheet is too large: up to about 500 KB.",
			};
		return { ok: true, text };
	} catch {
		return {
			ok: false,
			message:
				"Google Sheets didn't answer. Try again, or download it as CSV and upload that.",
		};
	}
}

type Checked = {
	fields: FormField[];
	columns: { header: string; question: string | null }[];
	missing: string[];
	rows: (PreviewRow & {
		stored?: { name: string; email: string; rows: StoredAnswer[] };
	})[];
};

async function check(
	tx: Tx,
	eventId: string,
	text: string,
	ticketTypeId: string,
): Promise<{ ok: true; checked: Checked } | { ok: false; message: string }> {
	const event = await tx.event.findUnique({
		where: { id: eventId },
		select: { timeZone: true, ticketTypes: { select: { id: true } } },
	});
	if (!event) return { ok: false, message: NOT_ALLOWED };
	if (!event.ticketTypes.some((t) => t.id === ticketTypeId))
		return { ok: false, message: "Choose the ticket these guests get." };

	const table = parseCsv(text);
	if (table.length < 2)
		return {
			ok: false,
			message:
				"No guests found: the first row names the columns, then one guest per row.",
		};
	if (table.length - 1 > IMPORT_ROW_LIMIT)
		return {
			ok: false,
			message: `Up to ${IMPORT_ROW_LIMIT} guests per import. Split the file.`,
		};

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
	const fields = read.ok ? read.fields : [];
	const sheet = readImport(fields, table);
	const label = new Map(fields.map((f) => [f.id, f.label]));
	const today = utcToZoned(new Date(), event.timeZone ?? "UTC").date;

	const results: Checked["rows"] = sheet.rows.map((row) => {
		const submission = readSubmission(fields, row.input, ticketTypeId, today);
		const nameField = fields.find((f) => f.core === "name");
		const emailField = fields.find((f) => f.core === "email");
		const raw = (id: string | undefined) => {
			const v = id ? row.input.answers[id] : null;
			return typeof v === "string" ? v.trim() : "";
		};
		if (!submission.ok) {
			const [fieldId, problem] = Object.entries(submission.problems)[0] ?? [];
			return {
				line: row.line,
				name: raw(nameField?.id),
				email: raw(emailField?.id).toLowerCase(),
				problem: fieldId
					? `${label.get(fieldId) ?? "A question"}: ${problem}`
					: submission.message,
			};
		}
		return {
			line: row.line,
			name: submission.name,
			email: submission.email,
			problem: null,
			stored: submission,
		};
	});

	// Twice in the file: the first one counts.
	const seen = new Set<string>();
	for (const row of results) {
		if (row.problem) continue;
		if (seen.has(row.email)) {
			row.problem = "Same email as an earlier row";
			delete row.stored;
		} else seen.add(row.email);
	}
	const emails = results.filter((r) => !r.problem).map((r) => r.email);
	const phoneFields = new Set(
		fields.filter((f) => f.kind === "phone").map((f) => f.id),
	);
	const phones = results.flatMap((r) =>
		(r.stored?.rows ?? [])
			.filter((a) => phoneFields.has(a.fieldId))
			.map((a) => String(a.value)),
	);
	const [guests, blocked] = await Promise.all([
		emails.length
			? tx.registration.findMany({
					where: {
						eventId,
						status: { not: "cancelled" },
						attendeeEmail: { in: emails },
					},
					select: { attendeeEmail: true },
				})
			: [],
		tx.blockedContact.findMany({
			where: {
				eventId,
				OR: [
					{ kind: "email", value: { in: emails } },
					{ kind: "phone", value: { in: phones } },
				],
			},
			select: { kind: true, value: true },
		}),
	]);
	const already = new Set(guests.map((g) => g.attendeeEmail));
	const blockedSet = new Set(blocked.map((b) => `${b.kind}:${b.value}`));
	for (const row of results) {
		if (row.problem) continue;
		const rowPhones = (row.stored?.rows ?? [])
			.filter((a) => phoneFields.has(a.fieldId))
			.map((a) => String(a.value));
		if (already.has(row.email)) row.problem = "Already a guest";
		else if (blockedSet.has(`email:${row.email}`))
			row.problem = "Email is on the blocklist";
		else if (rowPhones.some((p) => blockedSet.has(`phone:${p}`)))
			row.problem = "Phone is on the blocklist";
		if (row.problem) delete row.stored;
	}
	return {
		ok: true,
		checked: {
			fields,
			columns: sheet.columns.map((c) => ({
				header: c.header,
				question: c.fieldId ? (label.get(c.fieldId) ?? null) : null,
			})),
			missing: sheet.missing,
			rows: results,
		},
	};
}

/**
 * The file's text: as uploaded, or fetched from Google Sheets. Always
 * before any database work, so a slow sheet never holds a connection.
 */
async function sourceText(
	source: ImportSource,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
	if (source?.kind === "sheet") return fetchSheet(String(source.url ?? ""));
	if (source?.kind !== "csv" || typeof source.text !== "string")
		return { ok: false, message: "Choose a CSV file or paste a sheet link." };
	if (Buffer.byteLength(source.text) > IMPORT_TEXT_LIMIT)
		return {
			ok: false,
			message: "That file is too large: up to about 500 KB.",
		};
	return { ok: true, text: source.text };
}

/** Every row checked, nothing written: what an import would do. */
export async function previewImport(
	eventId: string,
	source: ImportSource,
	ticketTypeId: string,
): Promise<ImportPreview> {
	const user = await signedIn();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(ticketTypeId).success
	)
		return { ok: false, message: "Choose the ticket these guests get." };
	const text = await sourceText(source);
	if (!text.ok) return text;
	return asUser(user.id, async (tx) => {
		const result = await check(tx, eventId, text.text, ticketTypeId);
		if (!result.ok) return result;
		const { columns, missing, rows } = result.checked;
		return {
			ok: true,
			columns,
			missing,
			rows: rows.map(({ line, name, email, problem }) => ({
				line,
				name,
				email,
				problem,
			})),
			good: rows.filter((r) => !r.problem).length,
		};
	});
}

/**
 * Adds every good row as an imported guest, with answers, on the ticket,
 * all or none. Going past the ticket's or event's capacity asks first.
 */
export async function importGuests(
	eventId: string,
	source: ImportSource,
	ticketTypeId: string,
	force: boolean,
): Promise<ImportResult> {
	const user = await signedIn();
	if (
		!recordId.safeParse(eventId).success ||
		!recordId.safeParse(ticketTypeId).success
	)
		return { ok: false, message: "Choose the ticket these guests get." };
	const text = await sourceText(source);
	if (!text.ok) return text;
	try {
		const result = await asUser(
			user.id,
			async (tx): Promise<ImportResult> => {
				const checkedResult = await check(tx, eventId, text.text, ticketTypeId);
				if (!checkedResult.ok) return checkedResult;
				const good = checkedResult.checked.rows.filter((r) => r.stored);
				if (good.length === 0)
					return {
						ok: false,
						message: "No rows can be added. Fix the file and try again.",
					};

				if (!force) {
					const event = await tx.event.findUnique({
						where: { id: eventId },
						select: {
							capacity: true,
							ticketTypes: {
								select: {
									id: true,
									name: true,
									capacity: true,
									registeredCount: true,
								},
							},
						},
					});
					const ticket = event?.ticketTypes.find((t) => t.id === ticketTypeId);
					const total =
						event?.ticketTypes.reduce((s, t) => s + t.registeredCount, 0n) ??
						0n;
					const adding = BigInt(good.length);
					if (
						ticket?.capacity != null &&
						ticket.registeredCount + adding > ticket.capacity
					)
						return {
							ok: false,
							confirm: true,
							message: `${ticket.name} has room for ${ticket.capacity - ticket.registeredCount < 0n ? 0n : ticket.capacity - ticket.registeredCount} more; this adds ${good.length}. Import anyway?`,
						};
					if (event?.capacity != null && total + adding > event.capacity)
						return {
							ok: false,
							confirm: true,
							message: `The event has room for ${event.capacity - total < 0n ? 0n : event.capacity - total} more; this adds ${good.length}. Import anyway?`,
						};
				}

				const ids = good.map(() => randomUUID());
				await tx.registration.createMany({
					data: good.map((row, i) => ({
						id: ids[i] as string,
						eventId,
						ticketTypeId,
						attendeeName: row.stored?.name ?? row.name,
						attendeeEmail: row.stored?.email ?? row.email,
						status: "confirmed",
						source: "bulk",
					})),
				});
				const answers = good.flatMap((row, i) =>
					(row.stored?.rows ?? []).map((a) => ({
						registrationId: ids[i] as string,
						eventId,
						fieldId: a.fieldId,
						value: a.value as Prisma.InputJsonValue,
						otherText: a.otherText,
					})),
				);
				if (answers.length > 0)
					await tx.registrationAnswer.createMany({ data: answers });
				await tx.auditLog.create({
					data: {
						eventId,
						action: "guests.import",
						details: {
							added: ids.length,
							skipped: checkedResult.checked.rows.length - good.length,
							from: source.kind,
							ticket: ticketTypeId,
						},
					},
				});
				return {
					ok: true,
					ids,
					skipped: checkedResult.checked.rows.length - good.length,
				};
			},
			BULK_LIMITS,
		);
		if (result.ok) revalidatePath("/dashboard/[event]/guests", "page");
		return result;
	} catch (error) {
		const text = error instanceof Error ? error.message : "";
		if (/blocked contact/.test(text))
			return {
				ok: false,
				message: "A row's email was just blocked. Preview again.",
			};
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		)
			return {
				ok: false,
				message: "Two guests got the same code by chance. Import again.",
			};
		if (/row-level security|permission denied/.test(text))
			return { ok: false, message: NOT_ALLOWED };
		throw error;
	}
}
