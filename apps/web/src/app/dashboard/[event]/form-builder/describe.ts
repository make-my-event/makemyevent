import {
	type Condition,
	type FormField,
	OP_INFO,
	TICKET_SOURCE,
} from "@makemyevent/core";

type Ticket = { id: string; name: string };

/** One condition in words: "Profession is Student", "Ticket is any of Pro, VIP". */
export function describeCondition(
	condition: Condition,
	fields: readonly FormField[],
	tickets: readonly Ticket[],
): string {
	const isTicket = condition.source === TICKET_SOURCE;
	const source = isTicket
		? null
		: fields.find((field) => field.id === condition.source);
	const subject = isTicket ? "Ticket" : (source?.label ?? "A removed question");
	const op = OP_INFO[condition.op];
	const name = (id: string) =>
		isTicket
			? (tickets.find((t) => t.id === id)?.name ?? "a removed ticket")
			: (source?.settings.options?.find((o) => o.id === id)?.label ??
				"a removed option");
	const v = condition.value;
	let value = "";
	if (op.value === "option" && typeof v === "string") value = name(v);
	else if (op.value === "options" && Array.isArray(v))
		value = v.map(name).join(", ");
	else if (op.value !== "none" && v !== null && v !== undefined)
		value = op.value === "text" ? `"${v}"` : String(v);
	return [subject, op.label, value].filter(Boolean).join(" ");
}

/** The whole rule, short: the first condition, and how many more. */
export function describeShowIf(
	field: FormField,
	fields: readonly FormField[],
	tickets: readonly Ticket[],
): string | null {
	const showIf = field.showIf;
	const first = showIf?.conditions[0];
	if (!showIf || !first) return null;
	const head = describeCondition(first, fields, tickets);
	const rest = showIf.conditions.length - 1;
	if (rest === 0) return `Shown if ${head}`;
	return `Shown if ${head} ${showIf.match === "all" ? "and" : "or"} ${rest} more`;
}
