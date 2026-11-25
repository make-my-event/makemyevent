/**
 * The Guests list: what its address can ask for (search, filters, a page),
 * and how a stored answer reads to a person.
 *
 * The list's state lives in the address, so a filtered list can be
 * reloaded, bookmarked and shared with the team. Everything read from it
 * here is checked: anything unexpected falls back to the plain list.
 */

import {
	type Answer,
	answersProblems,
	FIELD_KIND_INFO,
	type FormField,
	FORM_LIMITS,
	hasOptions,
	OTHER_OPTION,
	visibleFields,
} from "./form.ts";
import { EMAIL } from "./links.ts";
import { phoneDigits } from "./phone.ts";

/** Guests per page: a screenful and a half, on one index scan. */
export const GUEST_PAGE_SIZE = 50;

export type CheckedFilter = "all" | "in" | "out";
export type SourceFilter = "all" | "self" | "invite" | "bulk";

export type GuestQuery = {
	/** What was searched for, trimmed; empty for none. */
	q: string;
	/** A ticket type's id, or null for every ticket. */
	ticket: string | null;
	checked: CheckedFilter;
	source: SourceFilter;
	/** Cancelled guests instead of the list: kept, out of the counts. */
	cancelled: boolean;
	/** Where the page starts: after this guest, newest first. */
	after: GuestCursor | null;
};

export type GuestCursor = { at: Date; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long enough for a name and email, short enough to stay cheap. */
export const GUEST_SEARCH_MAX = 100;

const one = (value: unknown): string =>
	typeof value === "string"
		? value
		: Array.isArray(value)
			? String(value[0] ?? "")
			: "";

/** The list's state from its address. */
export function readGuestQuery(
	params: Readonly<Record<string, unknown>>,
): GuestQuery {
	const q = one(params.q).trim().slice(0, GUEST_SEARCH_MAX);
	const ticket = one(params.ticket);
	const checked = one(params.checked);
	const source = one(params.source);
	return {
		q,
		ticket: UUID.test(ticket) ? ticket.toLowerCase() : null,
		checked: checked === "in" || checked === "out" ? checked : "all",
		source:
			source === "self" || source === "invite" || source === "bulk"
				? source
				: "all",
		cancelled: one(params.cancelled) === "1",
		after: decodeCursor(one(params.after)),
	};
}

/** The address for a list state; defaults are left out. */
export function guestQueryString(query: Partial<GuestQuery>): string {
	const params = new URLSearchParams();
	if (query.q) params.set("q", query.q);
	if (query.ticket) params.set("ticket", query.ticket);
	if (query.checked && query.checked !== "all")
		params.set("checked", query.checked);
	if (query.source && query.source !== "all")
		params.set("source", query.source);
	if (query.cancelled) params.set("cancelled", "1");
	if (query.after) params.set("after", encodeCursor(query.after));
	const text = params.toString();
	return text ? `?${text}` : "";
}

export function encodeCursor(cursor: GuestCursor): string {
	return `${cursor.at.toISOString()}_${cursor.id}`;
}

export function decodeCursor(text: string): GuestCursor | null {
	const [iso, id, extra] = text.split("_");
	if (!iso || !id || extra !== undefined || !UUID.test(id)) return null;
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) return null;
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? null : { at, id: id.toLowerCase() };
}

/**
 * A search that is a ticket code, in any case, with or without its dashes:
 * "mme7q4k2291" finds MME-7Q4K-2291. Null when it can't be one.
 */
export function ticketCodeSearch(q: string): string | null {
	const compact = q.toUpperCase().replace(/[\s-]/g, "");
	if (!/^[A-Z0-9]{4,32}$/.test(compact)) return null;
	const auto = /^MME([0-9A-HJKMNP-TV-Z]{8})$/.exec(compact);
	if (auto?.[1]) return `MME-${auto[1].slice(0, 4)}-${auto[1].slice(4)}`;
	return q.toUpperCase().trim();
}

/** Up to two letters for a guest's avatar: "Aarav Nair" is AN. */
export function guestInitials(name: string): string {
	const words = name
		.trim()
		.split(/\s+/)
		.filter((word) => /\p{L}|\p{N}/u.test(word));
	const first = words[0]?.match(/[\p{L}\p{N}]/u)?.[0] ?? "";
	const last =
		words.length > 1
			? (words[words.length - 1]?.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
			: "";
	return (first + last).toUpperCase() || "?";
}

/**
 * An answer as a person reads it: option labels instead of ids, "Yes" and
 * "No", a date as written. Empty when there is nothing to show. A choice
 * that was later removed from the form still shows, marked.
 */
export function answerText(
	field: Pick<FormField, "kind" | "settings">,
	value: Answer | undefined,
	otherText: string | null = null,
): string {
	if (
		value === undefined ||
		value === null ||
		!FIELD_KIND_INFO[field.kind].answers
	)
		return "";
	const label = (id: string) => {
		if (id === OTHER_OPTION)
			return otherText?.trim() ? `Other: ${otherText.trim()}` : "Other";
		return (
			field.settings.options?.find((option) => option.id === id)?.label ??
			"(a removed option)"
		);
	};
	switch (field.kind) {
		case "select":
		case "radio":
			return typeof value === "string" && value ? label(value) : "";
		case "checkboxes":
			return Array.isArray(value) ? value.map(label).join(", ") : "";
		case "yes_no":
			return value === "yes" ? "Yes" : value === "no" ? "No" : "";
		case "consent":
			return value === true ? "Agreed" : "";
		default:
			return typeof value === "string" ? value.trim() : "";
	}
}

// ---- Blocklist -------------------------------------------------------------

export type ContactKind = "email" | "phone";

/** A blocklist holds at most this many of each kind per event. */
export const BLOCKLIST_LIMIT = 500;

/**
 * An email or phone number as the blocklist stores it, so "A@B.com" and
 * "a@b.com" are one entry, and "+91 98765-43210" is +919876543210.
 */
export function normalizeContact(
	kind: ContactKind,
	raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
	const text = raw.trim();
	if (kind === "email") {
		const value = text.toLowerCase().replace(/^mailto:/, "");
		return EMAIL.test(value) && value.length <= 320
			? { ok: true, value }
			: { ok: false, message: `"${text}" is not an email address.` };
	}
	const value = phoneDigits(text.replace(/^tel:/i, ""));
	return value
		? { ok: true, value }
		: {
				ok: false,
				message: `"${text}" is not a whole phone number. Outside India, add its country code, like +44 20 7946 0958.`,
			};
}

/** Many at once, as pasted: one per line, or separated by commas. */
export function splitContacts(text: string): string[] {
	return [
		...new Set(
			text
				.split(/[\n,;]+/)
				.map((part) => part.trim())
				.filter(Boolean),
		),
	];
}

// ---- Ticket codes -----------------------------------------------------------

/**
 * A code the team chose instead of the generated one: 4 to 32 letters,
 * digits and dashes, starting with a letter or digit. Stored in capitals.
 */
export function normalizeTicketCode(
	raw: string,
): { ok: true; code: string } | { ok: false; message: string } {
	const code = raw.trim().toUpperCase();
	return /^[A-Z0-9][A-Z0-9-]{3,31}$/.test(code)
		? { ok: true, code }
		: {
				ok: false,
				message: "Use 4 to 32 letters, numbers and dashes, like VIP-001.",
			};
}

// ---- A guest's answers, as stored -----------------------------------------------

/** The most a name can be, as registrations stores it. */
export const GUEST_NAME_MAX = 120;

export type StoredAnswer = {
	fieldId: string;
	value: string | string[] | boolean;
	otherText: string | null;
};

export type Submission =
	| { ok: true; name: string; email: string; rows: StoredAnswer[] }
	| { ok: false; problems: Record<string, string>; message: string };

function plain(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asAnswer(value: unknown): Answer {
	if (typeof value === "string" || typeof value === "boolean") return value;
	if (Array.isArray(value))
		return value.filter((x): x is string => typeof x === "string");
	return null;
}

/**
 * A filled-in form, sent by the team for a guest (Invite guest, Edit
 * submission), checked by the same rules registration will use, and made
 * ready to store: only questions this guest sees, nothing empty, text
 * trimmed, emails lowercased, phones as +digits, choices only from the
 * list, "Other" text only when Other was chosen.
 *
 * `input` is { answers: { [fieldId]: Answer }, other: { [fieldId]: text } },
 * as sent; anything else in it is ignored.
 */
export function readSubmission(
	fields: readonly FormField[],
	input: unknown,
	ticketId: string | null,
	today: string,
): Submission {
	const raw = plain(input) ? input : {};
	const sentAnswers = plain(raw.answers) ? raw.answers : {};
	const sentOther = plain(raw.other) ? raw.other : {};
	const answers: Record<string, Answer> = {};
	const other: Record<string, string> = {};
	for (const field of fields) {
		answers[field.id] = asAnswer(sentAnswers[field.id]);
		const text = sentOther[field.id];
		if (typeof text === "string")
			other[field.id] = text.slice(0, FORM_LIMITS.help);
	}

	const problems = Object.fromEntries(
		answersProblems(fields, answers, ticketId, today, other),
	);
	const nameField = fields.find((field) => field.core === "name");
	const emailField = fields.find((field) => field.core === "email");
	const name =
		nameField && typeof answers[nameField.id] === "string"
			? (answers[nameField.id] as string).trim()
			: "";
	const email =
		emailField && typeof answers[emailField.id] === "string"
			? (answers[emailField.id] as string).trim().toLowerCase()
			: "";
	if (nameField && name.length > GUEST_NAME_MAX)
		problems[nameField.id] =
			`Keep the name under ${GUEST_NAME_MAX} characters.`;
	if (!nameField || !emailField)
		return {
			ok: false,
			problems,
			message: "The form needs its name and email questions.",
		};

	const found = Object.values(problems);
	if (found.length > 0)
		return {
			ok: false,
			problems,
			message:
				found.length === 1
					? (found[0] ?? "Check the marked answer.")
					: `Check the ${found.length} marked answers.`,
		};

	const shown = visibleFields(fields, answers, ticketId);
	const rows: StoredAnswer[] = [];
	for (const field of fields) {
		if (
			field.core ||
			!shown.has(field.id) ||
			!FIELD_KIND_INFO[field.kind].answers
		)
			continue;
		const value = answers[field.id];
		if (value === null || value === undefined || value === false) continue;
		let stored: string | string[] | boolean;
		if (typeof value === "string") {
			const text = value.trim();
			if (!text) continue;
			stored =
				field.kind === "phone"
					? (phoneDigits(text) ?? text)
					: field.kind === "email"
						? text.toLowerCase()
						: text;
		} else if (Array.isArray(value)) {
			if (value.length === 0) continue;
			stored = [...new Set(value)];
		} else stored = value;
		const choseOther =
			hasOptions(field.kind) &&
			(stored === OTHER_OPTION ||
				(Array.isArray(stored) && stored.includes(OTHER_OPTION)));
		rows.push({
			fieldId: field.id,
			value: stored,
			otherText: choseOther ? (other[field.id] ?? "").trim() || null : null,
		});
	}
	return { ok: true, name, email, rows };
}
