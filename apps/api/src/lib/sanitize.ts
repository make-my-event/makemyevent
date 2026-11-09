import sanitizeHtml from "sanitize-html";

/**
 * Server-side sanitizer for HTML produced by the web app's RichTextEditor
 * (Tiptap: StarterKit with headings 1-3, Underline, TextAlign, TaskList,
 * TaskItem, Table, Link). The allowlist mirrors exactly what that editor emits,
 * so editor output passes through unchanged and anything else (scripts, event
 * handlers, iframes, images, inline styles other than alignment and table
 * widths, javascript:/data: links) is removed.
 *
 * Apply it on write to every field whose content comes from RichTextEditor.
 * Do not apply it to plain-text fields: it HTML-encodes text such as "a < b",
 * which would then be shown literally where the field is rendered as text.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		"p",
		"br",
		"h1",
		"h2",
		"h3",
		"strong",
		"em",
		"u",
		"s",
		"code",
		"pre",
		"blockquote",
		"ul",
		"ol",
		"li",
		"hr",
		"a",
		// Task list items: <li data-type="taskItem"><label><input><span>…<div>
		"label",
		"input",
		"span",
		"div",
		// Tables
		"table",
		"colgroup",
		"col",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
	],
	allowedAttributes: {
		a: ["href", "target", "rel"],
		ol: ["start"],
		ul: ["data-type"],
		li: ["data-type", "data-checked"],
		input: ["type", "checked"],
		th: ["colspan", "rowspan", "colwidth", "style"],
		td: ["colspan", "rowspan", "colwidth", "style"],
		table: ["style"],
		col: ["style"],
		p: ["style"],
		h1: ["style"],
		h2: ["style"],
		h3: ["style"],
		code: ["class"],
	},
	allowedClasses: {
		code: [/^language-[a-z0-9+#-]+$/],
	},
	allowedStyles: {
		p: { "text-align": [/^(left|right|center|justify)$/] },
		h1: { "text-align": [/^(left|right|center|justify)$/] },
		h2: { "text-align": [/^(left|right|center|justify)$/] },
		h3: { "text-align": [/^(left|right|center|justify)$/] },
		table: {
			width: [/^\d+(\.\d+)?px$/],
			"min-width": [/^\d+(\.\d+)?px$/],
		},
		col: {
			width: [/^\d+(\.\d+)?px$/],
			"min-width": [/^\d+(\.\d+)?px$/],
		},
		th: { "min-width": [/^\d+(\.\d+)?px$/] },
		td: { "min-width": [/^\d+(\.\d+)?px$/] },
	},
	// Links: web and email only. No javascript:, data:, vbscript:, file:, and no
	// protocol-relative URLs (//evil.example).
	allowedSchemes: ["https", "http", "mailto"],
	allowedSchemesAppliedToAttributes: ["href"],
	allowProtocolRelative: false,
	// Only task-list checkboxes are allowed as inputs.
	exclusiveFilter: (frame) =>
		frame.tag === "input" && frame.attribs.type !== "checkbox",
	transformTags: {
		// Every link opens in a new tab without giving the target page a handle
		// to this window, and is not endorsed for SEO.
		// (Tiptap's Link extension already emits these same values.)
		a: sanitizeHtml.simpleTransform("a", {
			target: "_blank",
			rel: "noopener noreferrer nofollow",
		}),
	},
	disallowedTagsMode: "discard",
};

/** Returns sanitized HTML; see RICH_TEXT_OPTIONS for what is allowed. */
export function sanitizeRichText(html: string): string {
	return sanitizeHtml(html, RICH_TEXT_OPTIONS).trim();
}

/**
 * For nullable/optional rich-text inputs: trims, sanitizes, and maps an empty
 * result to null. `undefined` stays `undefined` so "field not sent" is
 * distinguishable from "field cleared".
 */
export function sanitizeOptionalRichText(
	html: string | null | undefined,
): string | null | undefined {
	if (html === undefined) return undefined;
	if (html === null) return null;
	const clean = sanitizeRichText(html);
	return clean === "" ? null : clean;
}
