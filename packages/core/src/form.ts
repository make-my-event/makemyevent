/**
 * The registration form: the questions a guest answers when they register,
 * in order, and the rules that show a question only when it applies.
 *
 * One set of rules, used everywhere a form is read: the Form Builder checks
 * a draft with them as the host edits, the server checks the whole form
 * again before it saves, the builder's preview shows and hides questions
 * with them, and registration will check answers with them. None of the
 * four can disagree about what a form means.
 *
 * Saved as one row per question (form_fields). Options and validation are
 * the row's `settings`, its conditions its `showIf`; both are small, read
 * with the row, and shaped by the kind, and are only ever written after
 * checkForm has passed the whole form.
 */

import { EMAIL, onHost, webUrl } from "./links.ts";
import { phoneDigits } from "./phone.ts";

// ---- Kinds ---------------------------------------------------------------

export const FIELD_KINDS = [
	"short_text",
	"long_text",
	"email",
	"phone",
	"number",
	"select",
	"radio",
	"checkboxes",
	"yes_no",
	"date",
	"url",
	"consent",
	"file",
	"heading",
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

export function isFieldKind(value: unknown): value is FieldKind {
	return (
		typeof value === "string" &&
		(FIELD_KINDS as readonly string[]).includes(value)
	);
}

/** Every form has these two; registration stores them on the registration itself. */
export type CoreField = "name" | "email";

type KindInfo = {
	/** The kind's name, as the host reads it. */
	label: string;
	/** What it is for, under the name in Add Field. */
	description: string;
	/** A new question's wording, to be replaced. */
	newLabel: string;
	/** Whether a placeholder means anything for it. */
	placeholder: boolean;
	/** Whether a guest answers it. A heading is not a question. */
	answers: boolean;
};

export const FIELD_KIND_INFO: Record<FieldKind, KindInfo> = {
	short_text: {
		label: "Short text",
		description: "A line: a name, a city, a college",
		newLabel: "New question",
		placeholder: true,
		answers: true,
	},
	long_text: {
		label: "Long text",
		description: "A few sentences in their own words",
		newLabel: "New question",
		placeholder: true,
		answers: true,
	},
	email: {
		label: "Email",
		description: "An address, checked as they type",
		newLabel: "Email address",
		placeholder: true,
		answers: true,
	},
	phone: {
		label: "Phone",
		description: "With a country picker, for calls or WhatsApp",
		newLabel: "Phone number",
		placeholder: true,
		answers: true,
	},
	number: {
		label: "Number",
		description: "A count, an age, years of experience",
		newLabel: "New question",
		placeholder: true,
		answers: true,
	},
	select: {
		label: "Dropdown",
		description: "One choice from a list",
		newLabel: "New question",
		placeholder: true,
		answers: true,
	},
	radio: {
		label: "Radio",
		description: "One choice, every option in view",
		newLabel: "New question",
		placeholder: false,
		answers: true,
	},
	checkboxes: {
		label: "Checkboxes",
		description: "Any number of choices",
		newLabel: "New question",
		placeholder: false,
		answers: true,
	},
	yes_no: {
		label: "Yes / No",
		description: "Two buttons, one tap",
		newLabel: "New question",
		placeholder: false,
		answers: true,
	},
	date: {
		label: "Date",
		description: "A day from a calendar",
		newLabel: "Date",
		placeholder: false,
		answers: true,
	},
	url: {
		label: "Website",
		description: "A link: portfolio, profile, project",
		newLabel: "Link",
		placeholder: true,
		answers: true,
	},
	consent: {
		label: "Consent",
		description: "One box to tick: terms, code of conduct",
		newLabel: "I agree to the code of conduct",
		placeholder: false,
		answers: true,
	},
	file: {
		label: "File upload",
		description: "A PDF or an image, up to 10 MB",
		newLabel: "Upload a file",
		placeholder: false,
		answers: true,
	},
	heading: {
		label: "Section heading",
		description: "Splits a long form into parts",
		newLabel: "New section",
		placeholder: false,
		answers: false,
	},
};

const CHOICE_KINDS: ReadonlySet<FieldKind> = new Set([
	"select",
	"radio",
	"checkboxes",
]);

export function hasOptions(kind: FieldKind): boolean {
	return CHOICE_KINDS.has(kind);
}

// ---- Limits ----------------------------------------------------------------

export const FORM_LIMITS = {
	fields: 60,
	options: 50,
	conditions: 5,
	label: 200,
	placeholder: 150,
	help: 300,
	optionLabel: 100,
	conditionText: 200,
	domains: 10,
	shortText: 300,
	longText: 5000,
	fileMb: 10,
} as const;

// ---- Shapes ------------------------------------------------------------------

export type FieldOption = { id: string; label: string };

export const FILE_TYPES = ["pdf", "image"] as const;
export type FileType = (typeof FILE_TYPES)[number];

/**
 * Options and validation, by kind. A key that does not belong to a field's
 * kind is dropped when the form is checked, so changing a field's kind never
 * carries a stale rule along.
 */
export type FieldSettings = {
	/** Dropdown, radio, checkboxes. */
	options?: FieldOption[];
	/** Dropdown, radio, checkboxes: a last "Other" choice they write in. */
	allowOther?: boolean;
	/** Short and long text. */
	minLength?: number | null;
	maxLength?: number | null;
	/** Number. */
	min?: number | null;
	max?: number | null;
	integer?: boolean;
	/** Checkboxes. */
	minSelected?: number | null;
	maxSelected?: number | null;
	/** Date, as YYYY-MM-DD. */
	earliest?: string | null;
	latest?: string | null;
	noFuture?: boolean;
	noPast?: boolean;
	/** Email: only addresses at these domains. */
	domains?: string[];
	/** Website: only links on these sites. */
	hosts?: string[];
	/** File upload. */
	accept?: FileType[];
	maxSizeMb?: number;
	/** Consent: where the terms are, for a link beside the box. */
	linkUrl?: string | null;
};

export const CONDITION_OPS = [
	"is",
	"is_not",
	"any_of",
	"none_of",
	"includes",
	"excludes",
	"yes",
	"no",
	"eq",
	"ne",
	"gt",
	"lt",
	"gte",
	"lte",
	"before",
	"after",
	"on",
	"filled",
	"empty",
	"equals",
	"contains",
] as const;

export type ConditionOp = (typeof CONDITION_OPS)[number];

/** The ticket a guest is registering for, as a condition's source. */
export const TICKET_SOURCE = "ticket";

export type Condition = {
	/** A field's id, or "ticket". */
	source: string;
	op: ConditionOp;
	/** An option id, option or ticket ids, a number, a date or text, by op. */
	value?: string | number | string[] | null | undefined;
};

export type ShowIf = { match: "all" | "any"; conditions: Condition[] };

export type FormField = {
	id: string;
	kind: FieldKind;
	core: CoreField | null;
	label: string;
	placeholder: string;
	help: string;
	required: boolean;
	settings: FieldSettings;
	showIf: ShowIf | null;
};

// ---- Ids --------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTION_ID = /^[a-z0-9]{1,16}$/;

export function newFieldId(): string {
	return crypto.randomUUID();
}

export function newOptionId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

// ---- Operators ---------------------------------------------------------------

type OpInfo = {
	label: string;
	value: "none" | "option" | "options" | "number" | "date" | "text";
};

export const OP_INFO: Record<ConditionOp, OpInfo> = {
	is: { label: "is", value: "option" },
	is_not: { label: "is not", value: "option" },
	any_of: { label: "is any of", value: "options" },
	none_of: { label: "is none of", value: "options" },
	includes: { label: "includes", value: "option" },
	excludes: { label: "doesn't include", value: "option" },
	yes: { label: "is yes", value: "none" },
	no: { label: "is no", value: "none" },
	eq: { label: "=", value: "number" },
	ne: { label: "≠", value: "number" },
	gt: { label: ">", value: "number" },
	lt: { label: "<", value: "number" },
	gte: { label: "≥", value: "number" },
	lte: { label: "≤", value: "number" },
	before: { label: "is before", value: "date" },
	after: { label: "is after", value: "date" },
	on: { label: "is on", value: "date" },
	filled: { label: "is answered", value: "none" },
	empty: { label: "is not answered", value: "none" },
	equals: { label: "is exactly", value: "text" },
	contains: { label: "contains", value: "text" },
};

const TEXT_OPS = ["filled", "empty", "equals", "contains"] as const;

/** What a condition can ask of a field of this kind; none for a heading. */
export function opsFor(
	kind: FieldKind | typeof TICKET_SOURCE,
): readonly ConditionOp[] {
	switch (kind) {
		case TICKET_SOURCE:
			return ["any_of", "none_of"];
		case "select":
		case "radio":
			return ["is", "is_not", "any_of", "none_of", "filled", "empty"];
		case "checkboxes":
			return ["includes", "excludes", "filled", "empty"];
		case "yes_no":
		case "consent":
			return ["yes", "no"];
		case "number":
			return ["eq", "ne", "gt", "lt", "gte", "lte", "filled", "empty"];
		case "date":
			return ["before", "after", "on", "filled", "empty"];
		case "short_text":
		case "long_text":
		case "email":
		case "url":
		case "phone":
			return TEXT_OPS;
		case "file":
			return ["filled", "empty"];
		case "heading":
			return [];
	}
}

// ---- Kind changes ----------------------------------------------------------

/**
 * Kinds a field with answers may change between, keeping those answers
 * meaningful: text to text, one choice to one choice.
 */
const COMPATIBLE: readonly (readonly FieldKind[])[] = [
	["short_text", "long_text"],
	["select", "radio"],
];

export function canChangeKind(
	field: Pick<FormField, "kind" | "core">,
	to: FieldKind,
	hasAnswers: boolean,
): boolean {
	if (field.core) return to === field.kind;
	if (to === field.kind || !hasAnswers) return true;
	return COMPATIBLE.some(
		(group) => group.includes(field.kind) && group.includes(to),
	);
}

/**
 * The field as another kind: what still applies is kept (wording, options
 * between choice kinds), the rest goes. Its own conditions are kept; ones on
 * other fields that no longer fit show as problems.
 */
export function changeKind(field: FormField, to: FieldKind): FormField {
	const info = FIELD_KIND_INFO[to];
	const settings: FieldSettings = {};
	if (hasOptions(to)) {
		settings.options = field.settings.options?.length
			? field.settings.options
			: defaultOptions();
		if (field.settings.allowOther) settings.allowOther = true;
	}
	if (to === "file") {
		settings.accept = ["pdf", "image"];
		settings.maxSizeMb = 5;
	}
	return {
		...field,
		kind: to,
		placeholder: info.placeholder ? field.placeholder : "",
		required: info.answers ? field.required : false,
		settings: { ...settings, ...keep(field.settings, to) },
	};
}

function keep(settings: FieldSettings, kind: FieldKind): FieldSettings {
	const out: FieldSettings = {};
	if (kind === "short_text" || kind === "long_text") {
		if (settings.minLength != null) out.minLength = settings.minLength;
		if (settings.maxLength != null) out.maxLength = settings.maxLength;
	}
	return out;
}

function defaultOptions(): FieldOption[] {
	return [
		{ id: newOptionId(), label: "Option 1" },
		{ id: newOptionId(), label: "Option 2" },
	];
}

/** A new question of a kind, ready to be worded. */
export function newField(kind: FieldKind): FormField {
	return changeKind(
		{
			id: newFieldId(),
			kind: "short_text",
			core: null,
			label: FIELD_KIND_INFO[kind].newLabel,
			placeholder: "",
			help: "",
			required: false,
			settings: {},
			showIf: null,
		},
		kind,
	);
}

/** A copy, below the original, with new ids and the same conditions. */
export function duplicateField(field: FormField): FormField {
	const options = field.settings.options?.map((option) => ({
		...option,
		id: newOptionId(),
	}));
	return {
		...field,
		id: newFieldId(),
		core: null,
		label: `${field.label} (copy)`.slice(0, FORM_LIMITS.label),
		settings: options ? { ...field.settings, options } : { ...field.settings },
		showIf: field.showIf
			? {
					...field.showIf,
					conditions: field.showIf.conditions.map((c) => ({ ...c })),
				}
			: null,
	};
}

// ---- The starting form -------------------------------------------------------

/**
 * What a new event asks: name and email, always; phone and profession,
 * until removed. The database's app.start_form() makes the same four.
 */
export function startingForm(): FormField[] {
	return [
		{
			id: newFieldId(),
			kind: "short_text",
			core: "name",
			label: "Full name",
			placeholder: "Your full name",
			help: "",
			required: true,
			settings: {},
			showIf: null,
		},
		{
			id: newFieldId(),
			kind: "email",
			core: "email",
			label: "Email address",
			placeholder: "you@example.com",
			help: "Your pass is sent here",
			required: true,
			settings: {},
			showIf: null,
		},
		{
			id: newFieldId(),
			kind: "phone",
			core: null,
			label: "Phone number",
			placeholder: "98765 43210",
			help: "",
			required: false,
			settings: {},
			showIf: null,
		},
		{
			id: newFieldId(),
			kind: "select",
			core: null,
			label: "Profession",
			placeholder: "Choose one",
			help: "",
			required: true,
			settings: {
				options: [
					{ id: newOptionId(), label: "Student" },
					{ id: newOptionId(), label: "Working professional" },
					{ id: newOptionId(), label: "Freelancer / Self-employed" },
				],
				allowOther: true,
			},
			showIf: null,
		},
	];
}

// ---- Checking a form --------------------------------------------------------

/** Where on a field a problem is, so the builder can open it there. */
export type ProblemArea =
	| "label"
	| "placeholder"
	| "help"
	| "kind"
	| "options"
	| "validation"
	| "showIf"
	| "form";

export type FormProblem = {
	/** The field it is on; null for the form as a whole. */
	fieldId: string | null;
	area: ProblemArea;
	/** For a condition, its place in the list. */
	index?: number;
	message: string;
};

export type FormContext = {
	/** The event's tickets, by id, for "Show if ticket is…". */
	tickets: readonly { id: string; name: string }[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN =
	/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function isDate(value: unknown): value is string {
	if (typeof value !== "string" || !DATE.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isCount(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function plainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads a draft sent from anywhere into fields, with every string trimmed
 * and every setting that does not belong to the kind dropped. Shapes that
 * cannot be read at all come back as a problem; everything readable is then
 * judged by formProblems.
 */
export function readForm(
	input: unknown,
): { ok: true; fields: FormField[] } | { ok: false; message: string } {
	if (!Array.isArray(input))
		return { ok: false, message: "The form could not be read." };
	if (input.length > FORM_LIMITS.fields)
		return {
			ok: false,
			message: `A form has at most ${FORM_LIMITS.fields} fields.`,
		};
	const fields: FormField[] = [];
	for (const raw of input) {
		if (
			!plainObject(raw) ||
			typeof raw.id !== "string" ||
			!isFieldKind(raw.kind)
		)
			return { ok: false, message: "The form could not be read." };
		const kind = raw.kind;
		const core = raw.core === "name" || raw.core === "email" ? raw.core : null;
		fields.push({
			id: raw.id,
			kind,
			core,
			label: text(raw.label),
			placeholder: FIELD_KIND_INFO[kind].placeholder
				? text(raw.placeholder)
				: "",
			help: text(raw.help),
			required: FIELD_KIND_INFO[kind].answers && raw.required === true,
			settings: readSettings(kind, raw.settings),
			showIf: readShowIf(raw.showIf),
		});
	}
	return { ok: true, fields };
}

function readSettings(kind: FieldKind, raw: unknown): FieldSettings {
	const s = plainObject(raw) ? raw : {};
	const out: FieldSettings = {};
	const num = (v: unknown) =>
		typeof v === "number" && Number.isFinite(v) ? v : null;
	const list = (v: unknown) =>
		Array.isArray(v)
			? v
					.filter((x): x is string => typeof x === "string")
					.map((x) => x.trim().toLowerCase())
					.filter(Boolean)
			: [];
	if (hasOptions(kind)) {
		out.options = Array.isArray(s.options)
			? s.options.map((o) =>
					plainObject(o)
						? { id: typeof o.id === "string" ? o.id : "", label: text(o.label) }
						: { id: "", label: "" },
				)
			: [];
		if (s.allowOther === true) out.allowOther = true;
	}
	if (kind === "short_text" || kind === "long_text") {
		out.minLength = num(s.minLength);
		out.maxLength = num(s.maxLength);
	}
	if (kind === "number") {
		out.min = num(s.min);
		out.max = num(s.max);
		if (s.integer === true) out.integer = true;
	}
	if (kind === "checkboxes") {
		out.minSelected = num(s.minSelected);
		out.maxSelected = num(s.maxSelected);
	}
	if (kind === "date") {
		out.earliest =
			typeof s.earliest === "string" && s.earliest ? s.earliest : null;
		out.latest = typeof s.latest === "string" && s.latest ? s.latest : null;
		if (s.noFuture === true) out.noFuture = true;
		if (s.noPast === true) out.noPast = true;
	}
	if (kind === "email") out.domains = list(s.domains);
	if (kind === "url") out.hosts = list(s.hosts);
	if (kind === "file") {
		out.accept = Array.isArray(s.accept)
			? FILE_TYPES.filter((t) => (s.accept as unknown[]).includes(t))
			: [];
		out.maxSizeMb = num(s.maxSizeMb) ?? FORM_LIMITS.fileMb;
	}
	if (kind === "consent")
		out.linkUrl =
			typeof s.linkUrl === "string" && s.linkUrl.trim()
				? s.linkUrl.trim()
				: null;
	// Nothing empty is kept: an unset limit is no key at all.
	for (const key of Object.keys(out) as (keyof FieldSettings)[]) {
		const value = out[key];
		if (
			value === null ||
			(Array.isArray(value) &&
				value.length === 0 &&
				key !== "options" &&
				key !== "accept")
		)
			delete out[key];
	}
	return out;
}

function readShowIf(raw: unknown): ShowIf | null {
	if (!plainObject(raw) || !Array.isArray(raw.conditions)) return null;
	const conditions: Condition[] = raw.conditions.map((c) => {
		const o = plainObject(c) ? c : {};
		const op = CONDITION_OPS.includes(o.op as ConditionOp)
			? (o.op as ConditionOp)
			: "filled";
		const v = o.value;
		const value = Array.isArray(v)
			? v.filter((x): x is string => typeof x === "string")
			: typeof v === "string" || typeof v === "number"
				? v
				: null;
		return { source: typeof o.source === "string" ? o.source : "", op, value };
	});
	if (conditions.length === 0) return null;
	return { match: raw.match === "any" ? "any" : "all", conditions };
}

/**
 * Everything wrong with a form, field by field, in order. Empty means it
 * can be saved. The builder shows these as the host edits; the server
 * refuses a save with any.
 */
export function formProblems(
	fields: readonly FormField[],
	context: FormContext,
): FormProblem[] {
	const problems: FormProblem[] = [];
	const add = (
		fieldId: string | null,
		area: ProblemArea,
		message: string,
		index?: number,
	) =>
		problems.push(
			index === undefined
				? { fieldId, area, message }
				: { fieldId, area, index, message },
		);

	if (fields.length > FORM_LIMITS.fields)
		add(null, "form", `A form has at most ${FORM_LIMITS.fields} fields.`);
	for (const core of ["name", "email"] as const) {
		const count = fields.filter((f) => f.core === core).length;
		if (count !== 1)
			add(
				null,
				"form",
				core === "name"
					? "The form must ask for the guest's name."
					: "The form must ask for the guest's email.",
			);
	}

	const seen = new Set<string>();
	const before = new Map<string, FormField>();
	const tickets = new Set(context.tickets.map((t) => t.id));

	for (const field of fields) {
		const id = field.id;
		if (!UUID.test(id) || seen.has(id)) {
			add(null, "form", "The form could not be read. Reload the page.");
			return problems;
		}
		seen.add(id);
		const info = FIELD_KIND_INFO[field.kind];

		// Wording.
		if (!field.label.trim())
			add(
				id,
				"label",
				field.kind === "heading"
					? "Give the section a title."
					: "Write the question.",
			);
		else if (field.label.length > FORM_LIMITS.label)
			add(id, "label", `Keep it under ${FORM_LIMITS.label} characters.`);
		if (field.placeholder.length > FORM_LIMITS.placeholder)
			add(
				id,
				"placeholder",
				`Keep it under ${FORM_LIMITS.placeholder} characters.`,
			);
		if (field.help.length > FORM_LIMITS.help)
			add(id, "help", `Keep it under ${FORM_LIMITS.help} characters.`);

		// Name and email: fixed in kind, always asked, of everyone.
		if (field.core === "name" && field.kind !== "short_text")
			add(id, "kind", "The name is always short text.");
		if (field.core === "email" && field.kind !== "email")
			add(id, "kind", "The email is always an email field.");
		if (field.core && !field.required)
			add(id, "form", "Name and email are always required.");
		if (field.core && field.showIf)
			add(id, "showIf", "Name and email are asked of everyone.");
		if (!info.answers && field.required)
			add(id, "form", "A heading is not a question.");

		settingsProblems(field, add);
		if (field.showIf) showIfProblems(field, field.showIf, before, tickets, add);

		before.set(id, field);
	}
	return problems;
}

function settingsProblems(
	field: FormField,
	add: (fieldId: string, area: ProblemArea, message: string) => void,
) {
	const s = field.settings;
	const id = field.id;
	if (hasOptions(field.kind)) {
		const options = s.options ?? [];
		const least = field.kind === "checkboxes" ? 1 : 2;
		if (options.length < least)
			add(
				id,
				"options",
				least === 1 ? "Add at least one option." : "Add at least two options.",
			);
		if (options.length > FORM_LIMITS.options)
			add(id, "options", `A list has at most ${FORM_LIMITS.options} options.`);
		const ids = new Set<string>();
		const labels = new Set<string>();
		for (const option of options) {
			if (!OPTION_ID.test(option.id) || ids.has(option.id)) {
				add(
					id,
					"options",
					"An option could not be read. Remove it and add it again.",
				);
				break;
			}
			ids.add(option.id);
			if (!option.label.trim()) {
				add(id, "options", "Every option needs wording.");
				break;
			}
			if (option.label.length > FORM_LIMITS.optionLabel) {
				add(
					id,
					"options",
					`Keep options under ${FORM_LIMITS.optionLabel} characters.`,
				);
				break;
			}
			const key = option.label.trim().toLowerCase();
			if (labels.has(key)) {
				add(id, "options", `"${option.label}" is in the list twice.`);
				break;
			}
			labels.add(key);
		}
	}
	if (field.kind === "short_text" || field.kind === "long_text") {
		const cap =
			field.kind === "short_text"
				? FORM_LIMITS.shortText
				: FORM_LIMITS.longText;
		const { minLength: min, maxLength: max } = s;
		if (min != null && (!isCount(min) || min > cap))
			add(id, "validation", "The least is a whole number of characters.");
		else if (max != null && (!isCount(max) || max < 1 || max > cap))
			add(id, "validation", `The most is between 1 and ${cap} characters.`);
		else if (min != null && max != null && min > max)
			add(id, "validation", "The least can't be more than the most.");
	}
	if (
		field.kind === "number" &&
		s.min != null &&
		s.max != null &&
		s.min > s.max
	)
		add(id, "validation", "The smallest can't be more than the largest.");
	if (field.kind === "checkboxes") {
		const count = s.options?.length ?? 0;
		const { minSelected: min, maxSelected: max } = s;
		if (min != null && (!isCount(min) || min > count))
			add(
				id,
				"validation",
				"They can't be asked to pick more options than there are.",
			);
		else if (max != null && (!isCount(max) || max < 1))
			add(id, "validation", "The most to pick is at least 1.");
		else if (min != null && max != null && min > max)
			add(id, "validation", "The least can't be more than the most.");
	}
	if (field.kind === "date") {
		if (s.earliest != null && !isDate(s.earliest))
			add(id, "validation", "Check the earliest date.");
		else if (s.latest != null && !isDate(s.latest))
			add(id, "validation", "Check the latest date.");
		else if (s.earliest && s.latest && s.earliest > s.latest)
			add(id, "validation", "The earliest date is after the latest.");
		else if (s.noFuture && s.noPast)
			add(
				id,
				"validation",
				"Choose past or future, not both: that leaves only today.",
			);
	}
	if (field.kind === "email") {
		const domains = s.domains ?? [];
		if (domains.length > FORM_LIMITS.domains)
			add(id, "validation", `At most ${FORM_LIMITS.domains} domains.`);
		const bad = domains.find((d) => !DOMAIN.test(d));
		if (bad)
			add(
				id,
				"validation",
				`"${bad}" is not a domain. Write it like college.edu.`,
			);
	}
	if (field.kind === "url") {
		const hosts = s.hosts ?? [];
		if (hosts.length > FORM_LIMITS.domains)
			add(id, "validation", `At most ${FORM_LIMITS.domains} sites.`);
		const bad = hosts.find((d) => !DOMAIN.test(d));
		if (bad)
			add(
				id,
				"validation",
				`"${bad}" is not a site. Write it like github.com.`,
			);
	}
	if (field.kind === "file") {
		if (!s.accept?.length)
			add(id, "validation", "Choose which files they can upload.");
		const size = s.maxSizeMb;
		if (!isCount(size) || size < 1 || size > FORM_LIMITS.fileMb)
			add(id, "validation", `The size limit is 1 to ${FORM_LIMITS.fileMb} MB.`);
	}
	if (field.kind === "consent" && s.linkUrl && !webUrl(s.linkUrl))
		add(id, "validation", "The terms link must be a web address, https.");
}

function showIfProblems(
	field: FormField,
	showIf: ShowIf,
	before: ReadonlyMap<string, FormField>,
	tickets: ReadonlySet<string>,
	add: (
		fieldId: string,
		area: ProblemArea,
		message: string,
		index?: number,
	) => void,
) {
	const id = field.id;
	if (
		showIf.conditions.length === 0 ||
		showIf.conditions.length > FORM_LIMITS.conditions
	) {
		add(id, "showIf", `Use 1 to ${FORM_LIMITS.conditions} conditions.`);
		return;
	}
	showIf.conditions.forEach((condition, index) => {
		const fail = (message: string) => add(id, "showIf", message, index);
		let ops: readonly ConditionOp[];
		let optionIds: ReadonlySet<string> | null = null;
		if (condition.source === TICKET_SOURCE) {
			ops = opsFor(TICKET_SOURCE);
			optionIds = tickets;
		} else {
			const source = before.get(condition.source);
			if (!source) {
				fail(
					condition.source === id
						? "A question can't depend on itself."
						: "This depends on a question that is gone or now below it. Choose another.",
				);
				return;
			}
			ops = opsFor(source.kind);
			if (hasOptions(source.kind))
				optionIds = new Set((source.settings.options ?? []).map((o) => o.id));
			if (ops.length === 0) {
				fail("A heading has no answer to test.");
				return;
			}
		}
		if (!ops.includes(condition.op)) {
			fail("That test doesn't fit this question. Choose another.");
			return;
		}
		const v = condition.value;
		switch (OP_INFO[condition.op].value) {
			case "option":
				if (typeof v !== "string" || !optionIds?.has(v))
					fail("Choose an option.");
				break;
			case "options":
				if (!Array.isArray(v) || v.length === 0)
					fail(
						condition.source === TICKET_SOURCE
							? "Choose a ticket."
							: "Choose at least one option.",
					);
				else if (!v.every((x) => optionIds?.has(x)))
					fail(
						condition.source === TICKET_SOURCE
							? "A ticket here no longer exists."
							: "An option here was removed.",
					);
				break;
			case "number":
				if (typeof v !== "number" || !Number.isFinite(v))
					fail("Enter a number.");
				break;
			case "date":
				if (!isDate(v)) fail("Choose a date.");
				break;
			case "text":
				if (typeof v !== "string" || !v.trim()) fail("Write what to look for.");
				else if (v.length > FORM_LIMITS.conditionText)
					fail(`Keep it under ${FORM_LIMITS.conditionText} characters.`);
				break;
			case "none":
				break;
		}
	});
}

export type FormCheck =
	| { ok: true; fields: FormField[] }
	| { ok: false; problem: FormProblem };

/** For the server: read, then judge; the first problem, if any. */
export function checkForm(input: unknown, context: FormContext): FormCheck {
	const read = readForm(input);
	if (!read.ok)
		return {
			ok: false,
			problem: { fieldId: null, area: "form", message: read.message },
		};
	const [problem] = formProblems(read.fields, context);
	return problem ? { ok: false, problem } : { ok: true, fields: read.fields };
}

// ---- Moving fields -------------------------------------------------------

/**
 * Whether a field may move to a new place without breaking a condition:
 * it must stay below every question it depends on, and above every
 * question that depends on it. Null if it may; otherwise why not.
 */
export function moveProblem(
	fields: readonly FormField[],
	from: number,
	to: number,
): string | null {
	const field = fields[from];
	if (!field || to < 0 || to >= fields.length || from === to) return null;
	const moved = [...fields];
	moved.splice(from, 1);
	moved.splice(to, 0, field);
	const place = new Map(moved.map((f, i) => [f.id, i]));
	const here = to;
	for (const condition of field.showIf?.conditions ?? []) {
		const at = place.get(condition.source);
		if (at !== undefined && at > here) {
			const source = fields.find((f) => f.id === condition.source);
			return `${field.label} depends on ${source?.label ?? "a question"}, so it stays below it.`;
		}
	}
	for (const other of moved) {
		const at = place.get(other.id) ?? 0;
		if (
			at < here &&
			other.showIf?.conditions.some((c) => c.source === field.id)
		)
			return `${other.label} depends on ${field.label}, so ${field.label} stays above it.`;
	}
	return null;
}

/** The questions whose conditions test this one. */
export function dependentsOf(
	fields: readonly FormField[],
	id: string,
): FormField[] {
	return fields.filter((f) =>
		f.showIf?.conditions.some((c) => c.source === id),
	);
}

/** The form without a field, and without the conditions that tested it. */
export function removeField(
	fields: readonly FormField[],
	id: string,
): FormField[] {
	return fields
		.filter((f) => f.id !== id)
		.map((f) => {
			if (!f.showIf?.conditions.some((c) => c.source === id)) return f;
			const conditions = f.showIf.conditions.filter((c) => c.source !== id);
			return {
				...f,
				showIf: conditions.length ? { ...f.showIf, conditions } : null,
			};
		});
}

// ---- Answers ---------------------------------------------------------------

/**
 * A guest's answer, by kind: text as typed; an option's id for one choice
 * ("other" with otherText for a written-in one); option ids for checkboxes;
 * "yes" or "no"; true for a ticked consent; YYYY-MM-DD for a date; a file's
 * name until uploads are stored.
 */
export type Answer = string | string[] | boolean | null;
export type Answers = Readonly<Record<string, Answer>>;

export const OTHER_OPTION = "other";

function isBlank(answer: Answer | undefined): boolean {
	if (answer === undefined || answer === null || answer === false) return true;
	if (typeof answer === "string") return answer.trim() === "";
	if (Array.isArray(answer)) return answer.length === 0;
	return false;
}

/**
 * Which fields a guest sees, given their answers so far and their ticket.
 * In order, so a question's sources are settled before it: a condition on a
 * hidden question is false, so a branch hides with its root.
 */
export function visibleFields(
	fields: readonly FormField[],
	answers: Answers,
	ticketId: string | null,
): Set<string> {
	const shown = new Set<string>();
	const byId = new Map(fields.map((f) => [f.id, f]));
	for (const field of fields) {
		if (!field.showIf) {
			shown.add(field.id);
			continue;
		}
		const results = field.showIf.conditions.map((c) => {
			if (c.source === TICKET_SOURCE) {
				const ids = Array.isArray(c.value) ? c.value : [];
				if (!ticketId) return false;
				return c.op === "any_of"
					? ids.includes(ticketId)
					: !ids.includes(ticketId);
			}
			const source = byId.get(c.source);
			if (!source || !shown.has(source.id)) return false;
			return conditionHolds(c, source, answers[source.id] ?? null);
		});
		const match =
			field.showIf.match === "any"
				? results.some(Boolean)
				: results.every(Boolean);
		if (match) shown.add(field.id);
	}
	return shown;
}

/**
 * One condition against one answer. A test of an unanswered question is
 * false, except "is not answered" and "doesn't include" (nothing ticked
 * includes nothing).
 */
export function conditionHolds(
	condition: Condition,
	source: FormField,
	answer: Answer,
): boolean {
	const v = condition.value;
	const blank = isBlank(answer);
	switch (condition.op) {
		case "filled":
			return !blank;
		case "empty":
			return blank;
		case "is":
			return !blank && answer === v;
		case "is_not":
			return !blank && answer !== v;
		case "any_of":
			return (
				!blank &&
				Array.isArray(v) &&
				typeof answer === "string" &&
				v.includes(answer)
			);
		case "none_of":
			return (
				!blank &&
				Array.isArray(v) &&
				typeof answer === "string" &&
				!v.includes(answer)
			);
		case "includes":
			return (
				Array.isArray(answer) && typeof v === "string" && answer.includes(v)
			);
		case "excludes":
			return !(
				Array.isArray(answer) &&
				typeof v === "string" &&
				answer.includes(v)
			);
		case "yes":
			return source.kind === "consent" ? answer === true : answer === "yes";
		case "no":
			return source.kind === "consent" ? answer !== true : answer === "no";
		case "eq":
		case "ne":
		case "gt":
		case "lt":
		case "gte":
		case "lte": {
			if (blank || typeof answer !== "string" || typeof v !== "number")
				return false;
			const n = Number(answer);
			if (!Number.isFinite(n)) return false;
			return {
				eq: n === v,
				ne: n !== v,
				gt: n > v,
				lt: n < v,
				gte: n >= v,
				lte: n <= v,
			}[condition.op];
		}
		case "before":
		case "after":
		case "on":
			if (blank || typeof answer !== "string" || typeof v !== "string")
				return false;
			return condition.op === "before"
				? answer < v
				: condition.op === "after"
					? answer > v
					: answer === v;
		case "equals":
			return (
				!blank &&
				typeof answer === "string" &&
				typeof v === "string" &&
				answer.trim().toLowerCase() === v.trim().toLowerCase()
			);
		case "contains":
			return (
				!blank &&
				typeof answer === "string" &&
				typeof v === "string" &&
				answer.toLowerCase().includes(v.trim().toLowerCase())
			);
	}
}

/**
 * What is wrong with one answer, or null. Only for a field the guest can
 * see: a hidden question is never required and its answer is dropped.
 * `today` is the event's local date, YYYY-MM-DD, for "not in the future".
 */
export function answerProblem(
	field: FormField,
	answer: Answer,
	today: string,
	otherText = "",
): string | null {
	const s = field.settings;
	if (!FIELD_KIND_INFO[field.kind].answers) return null;
	if (isBlank(answer)) {
		if (!field.required) return null;
		if (field.kind === "consent") return "Tick the box to go on.";
		if (hasOptions(field.kind) || field.kind === "yes_no")
			return "Choose an answer.";
		if (field.kind === "file") return "Add a file.";
		return "Answer this to go on.";
	}
	const value = typeof answer === "string" ? answer.trim() : "";
	switch (field.kind) {
		case "short_text":
		case "long_text": {
			const cap =
				field.kind === "short_text"
					? FORM_LIMITS.shortText
					: FORM_LIMITS.longText;
			const max = Math.min(s.maxLength ?? cap, cap);
			if (s.minLength && value.length < s.minLength)
				return `Write at least ${s.minLength} characters.`;
			if (value.length > max) return `Keep it under ${max} characters.`;
			return null;
		}
		case "email": {
			if (!EMAIL.test(value))
				return "Enter an email address, like you@example.com.";
			const domain = value.split("@")[1]?.toLowerCase() ?? "";
			if (
				s.domains?.length &&
				!s.domains.some((d) => domain === d || domain.endsWith(`.${d}`))
			)
				return `Use an address at ${s.domains.join(" or ")}.`;
			return null;
		}
		case "phone":
			return phoneDigits(value)
				? null
				: "Enter a whole phone number, like 98765 43210.";
		case "number": {
			const n = Number(value);
			if (!value || !Number.isFinite(n)) return "Enter a number.";
			if (s.integer && !Number.isInteger(n)) return "Enter a whole number.";
			if (s.min != null && n < s.min) return `Enter ${s.min} or more.`;
			if (s.max != null && n > s.max) return `Enter ${s.max} or less.`;
			return null;
		}
		case "select":
		case "radio": {
			if (value === OTHER_OPTION && s.allowOther)
				return otherText.trim() ? null : "Write your answer for Other.";
			return s.options?.some((o) => o.id === value)
				? null
				: "Choose an answer.";
		}
		case "checkboxes": {
			const picked = Array.isArray(answer) ? answer : [];
			const known = new Set((s.options ?? []).map((o) => o.id));
			if (s.allowOther) known.add(OTHER_OPTION);
			if (!picked.every((p) => known.has(p))) return "Choose from the list.";
			if (picked.includes(OTHER_OPTION) && !otherText.trim())
				return "Write your answer for Other.";
			if (s.minSelected && picked.length < s.minSelected)
				return `Choose at least ${s.minSelected}.`;
			if (s.maxSelected && picked.length > s.maxSelected)
				return `Choose at most ${s.maxSelected}.`;
			return null;
		}
		case "yes_no":
			return value === "yes" || value === "no" ? null : "Choose yes or no.";
		case "date": {
			if (!isDate(value)) return "Choose a date.";
			if (s.noFuture && value > today)
				return "Choose a date that isn't in the future.";
			if (s.noPast && value < today)
				return "Choose a date that isn't in the past.";
			if (s.earliest && value < s.earliest)
				return `Choose ${s.earliest} or later.`;
			if (s.latest && value > s.latest) return `Choose ${s.latest} or earlier.`;
			return null;
		}
		case "url": {
			const url = webUrl(value);
			if (!url) return "Enter a web address, like yoursite.com.";
			if (s.hosts?.length && !onHost(url, s.hosts))
				return `Use a link on ${s.hosts.join(" or ")}.`;
			return null;
		}
		case "consent":
			return answer === true ? null : "Tick the box to go on.";
		case "file":
			return null;
		case "heading":
			return null;
	}
}

/** Every problem with a guest's answers, by field id, for the fields they see. */
export function answersProblems(
	fields: readonly FormField[],
	answers: Answers,
	ticketId: string | null,
	today: string,
	otherText: Readonly<Record<string, string>> = {},
): Map<string, string> {
	const shown = visibleFields(fields, answers, ticketId);
	const problems = new Map<string, string>();
	for (const field of fields) {
		if (!shown.has(field.id)) continue;
		const problem = answerProblem(
			field,
			answers[field.id] ?? null,
			today,
			otherText[field.id] ?? "",
		);
		if (problem) problems.set(field.id, problem);
	}
	return problems;
}

// ---- Quick fields ----------------------------------------------------------

export type FieldPreset = {
	id: string;
	label: string;
	/** Words someone might search for it by. */
	keywords: string;
	build: () => FormField;
};

function preset(
	kind: FieldKind,
	label: string,
	rest: Partial<FormField> = {},
): FormField {
	return { ...newField(kind), label, ...rest };
}

function options(...labels: string[]): FieldOption[] {
	return labels.map((label) => ({ id: newOptionId(), label }));
}

/** Questions events ask again and again, ready-made. */
export const FIELD_PRESETS: readonly FieldPreset[] = [
	{
		id: "college",
		label: "College / University",
		keywords: "school institution student campus",
		build: () =>
			preset("short_text", "College / University", {
				placeholder: "Where you study",
			}),
	},
	{
		id: "company",
		label: "Company / Organization",
		keywords: "employer work org",
		build: () =>
			preset("short_text", "Company / Organization", {
				placeholder: "Where you work",
			}),
	},
	{
		id: "role",
		label: "Role / Designation",
		keywords: "job title position designation",
		build: () =>
			preset("short_text", "Role / Designation", {
				placeholder: "What you do",
			}),
	},
	{
		id: "city",
		label: "City",
		keywords: "location town place",
		build: () =>
			preset("short_text", "City", { placeholder: "Where you're coming from" }),
	},
	{
		id: "tshirt",
		label: "T-shirt size",
		keywords: "swag merch shirt size",
		build: () =>
			preset("radio", "T-shirt size", {
				settings: { options: options("XS", "S", "M", "L", "XL", "XXL") },
			}),
	},
	{
		id: "diet",
		label: "Dietary preference",
		keywords: "food meal veg vegan halal allergy",
		build: () =>
			preset("radio", "Dietary preference", {
				settings: {
					options: options(
						"No preference",
						"Vegetarian",
						"Vegan",
						"Jain",
						"Halal",
					),
					allowOther: true,
				},
			}),
	},
	{
		id: "profile",
		label: "LinkedIn / GitHub profile",
		keywords: "linkedin github portfolio social url link",
		build: () =>
			preset("url", "LinkedIn or GitHub profile", {
				placeholder: "linkedin.com/in/you",
				settings: { hosts: ["linkedin.com", "github.com"] },
			}),
	},
	{
		id: "source",
		label: "How did you hear about us?",
		keywords: "referral source marketing found",
		build: () =>
			preset("checkboxes", "How did you hear about us?", {
				settings: {
					options: options(
						"Instagram",
						"WhatsApp",
						"LinkedIn",
						"A friend",
						"College or workplace",
					),
					allowOther: true,
				},
			}),
	},
	{
		id: "emergency",
		label: "Emergency contact",
		keywords: "emergency contact phone safety",
		build: () =>
			preset("phone", "Emergency contact number", {
				help: "Someone we can call if something happens at the event",
				placeholder: "98765 43210",
			}),
	},
	{
		id: "access",
		label: "Accessibility needs",
		keywords: "accessibility wheelchair support needs disability",
		build: () =>
			preset(
				"long_text",
				"Anything we should know to make the event work for you?",
				{
					help: "Access needs, seating, interpretation. Only the organizers see this.",
				},
			),
	},
	{
		id: "conduct",
		label: "Code of conduct",
		keywords: "consent agree terms rules conduct",
		build: () =>
			preset("consent", "I agree to follow the event's code of conduct", {
				required: true,
			}),
	},
];
