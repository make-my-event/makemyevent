/**
 * Bulk upload and export: reading a spreadsheet the team exported as CSV
 * (or a Google Sheet, fetched as CSV), matching its columns to the form's
 * questions, and writing the guest list back out as CSV.
 *
 * Every imported row still goes through readSubmission, the same rules as
 * a guest registering; this only turns a row of text into the answers a
 * form holds.
 */

import {
	type Answer,
	type FormField,
	hasOptions,
	OTHER_OPTION,
} from "./form.ts";

/** Rows in one import: enough for a big event, small enough to check at once. */
export const IMPORT_ROW_LIMIT = 2000;
/**
 * Characters in one file, about 500 KB: far more than the row limit needs.
 * A server action takes 1 MB, and a file doubles at worst when it is sent
 * (its quotes and line breaks are escaped).
 */
export const IMPORT_TEXT_LIMIT = 500_000;

/**
 * CSV as RFC 4180 writes it: commas, quoted fields, doubled quotes inside
 * them, line breaks inside quotes, CRLF or LF, and the byte-order mark Excel
 * puts first. Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const endRow = () => {
		row.push(field);
		field = "";
		if (row.some((cell) => cell.trim() !== "")) rows.push(row);
		row = [];
	};
	for (; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
		} else if (c === '"' && field === "") quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			endRow();
		} else field += c;
	}
	if (field !== "" || row.length > 0) endRow();
	return rows;
}

const fold = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

/** Headers a spreadsheet might use for the questions every form has. */
const ALIASES: Record<"name" | "email" | "phone", readonly string[]> = {
	name: ["name", "full name", "guest name", "attendee name", "attendee"],
	email: ["email", "email address", "e mail", "mail", "email id"],
	phone: [
		"phone",
		"phone number",
		"mobile",
		"mobile number",
		"whatsapp",
		"contact number",
	],
};

export type ImportColumn = {
	/** As written in the file's first row. */
	header: string;
	/** The question it fills, or null: ignored. */
	fieldId: string | null;
};

export type ImportRow = {
	/** The line in the file, counting the header as 1, for messages. */
	line: number;
	input: { answers: Record<string, Answer>; other: Record<string, string> };
};

export type ImportSheet = {
	columns: ImportColumn[];
	rows: ImportRow[];
	/** Required questions no column fills: every row would fail them. */
	missing: string[];
};

/** What a cell says, as the answer its question holds. */
function cellAnswer(
	field: FormField,
	cell: string,
): { answer: Answer; other?: string } {
	const text = cell.trim();
	if (!text) return { answer: null };
	const options = field.settings.options ?? [];
	const option = (label: string) =>
		options.find((o) => fold(o.label) === fold(label))?.id;
	if (field.kind === "select" || field.kind === "radio") {
		const id = option(text);
		if (id) return { answer: id };
		if (field.settings.allowOther) return { answer: OTHER_OPTION, other: text };
		// Kept as written: the row is then refused with "Choose an answer."
		return { answer: text };
	}
	if (field.kind === "checkboxes") {
		const parts = text
			.split(/[;,|]/)
			.map((p) => p.trim())
			.filter(Boolean);
		const ids: string[] = [];
		const unknown: string[] = [];
		for (const part of parts) {
			const id = option(part);
			if (id) ids.push(id);
			else unknown.push(part);
		}
		if (unknown.length > 0 && field.settings.allowOther)
			return { answer: [...ids, OTHER_OPTION], other: unknown.join(", ") };
		return { answer: unknown.length > 0 ? [...ids, ...unknown] : ids };
	}
	if (field.kind === "yes_no") {
		const v = fold(text);
		if (["yes", "y", "true", "1"].includes(v)) return { answer: "yes" };
		if (["no", "n", "false", "0"].includes(v)) return { answer: "no" };
		return { answer: text };
	}
	if (field.kind === "consent") {
		const v = fold(text);
		return {
			answer: ["yes", "y", "true", "1", "agreed", "agree", "x"].includes(v),
		};
	}
	return { answer: text };
}

/**
 * The file's first row matched to questions: by the question's wording
 * (case and punctuation aside), or for name, email and phone by the headers
 * people usually use. Each later row becomes the answers a form holds.
 */
export function readImport(
	fields: readonly FormField[],
	table: string[][],
): ImportSheet {
	const [header = [], ...body] = table;
	const taken = new Set<string>();
	const columns: ImportColumn[] = header.map((raw) => {
		const label = fold(raw);
		let field = fields.find(
			(f) =>
				!taken.has(f.id) && f.kind !== "heading" && fold(f.label) === label,
		);
		if (!field) {
			const core = (Object.keys(ALIASES) as (keyof typeof ALIASES)[]).find(
				(key) => ALIASES[key].includes(label),
			);
			if (core === "phone")
				field = fields.find((f) => !taken.has(f.id) && f.kind === "phone");
			else if (core)
				field = fields.find((f) => !taken.has(f.id) && f.core === core);
		}
		if (field) taken.add(field.id);
		return { header: raw.trim(), fieldId: field?.id ?? null };
	});
	const rows: ImportRow[] = body.map((cells, index) => {
		const answers: Record<string, Answer> = {};
		const other: Record<string, string> = {};
		columns.forEach((column, c) => {
			const field = column.fieldId
				? fields.find((f) => f.id === column.fieldId)
				: undefined;
			if (!field) return;
			const { answer, other: written } = cellAnswer(field, cells[c] ?? "");
			answers[field.id] = answer;
			if (written && hasOptions(field.kind)) other[field.id] = written;
		});
		return { line: index + 2, input: { answers, other } };
	});
	// Only questions everyone sees: a "Show if" question may be required of
	// some rows and not others, and is judged per row.
	const missing = fields
		.filter((f) => f.required && !f.showIf && !taken.has(f.id))
		.map((f) => f.label);
	return { columns, rows, missing };
}

/** A header row for the template: the form's questions, in order. */
export function templateHeader(fields: readonly FormField[]): string[] {
	return fields.filter((f) => f.kind !== "heading").map((f) => f.label);
}

/**
 * One CSV cell, safe to open in a spreadsheet: quoted when it needs to be,
 * and written as text (a leading apostrophe) when a spreadsheet would run
 * it as a formula: starting with =, @, a tab or a return, or with + or -
 * unless what follows is only a number (a phone number like +91 98765 is
 * a value, not a formula, and stays as it is).
 */
export function csvCell(value: string): string {
	const formula =
		/^[=@\t\r]/.test(value) ||
		(/^[+-]/.test(value) && !/^[+-][\d\s().-]*$/.test(value));
	const safe = formula ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(cells: readonly string[]): string {
	return `${cells.map(csvCell).join(",")}\r\n`;
}

/**
 * The CSV export of a Google Sheet, from the link someone pastes: only
 * docs.google.com spreadsheets, and the tab the link points at. Null when
 * it isn't one.
 */
export function sheetCsvUrl(link: string): string | null {
	let url: URL;
	try {
		url = new URL(link.trim());
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.hostname !== "docs.google.com")
		return null;
	const id = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/.exec(
		url.pathname,
	)?.[1];
	if (!id) return null;
	const gid = /(?:^|[#&?])gid=(\d{1,12})/.exec(`${url.search}${url.hash}`)?.[1];
	return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}
