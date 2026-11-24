/**
 * An event's About text: a document from the rich-text editor, stored as
 * JSON (the editor's own tree), never as HTML. A browser can send anything,
 * so nothing it sends is stored as it came: sanitizeAbout rebuilds the
 * document from an allowlist, keeping only the parts below and only the
 * attributes each needs. Whatever renders it later (the public page) renders
 * a known tree, so there is no markup to smuggle a script in.
 *
 *   blocks  paragraph, heading 1-3, bullet and numbered lists, quote,
 *           code block, divider, image
 *   inline  text, line break; bold, italic, underline, strike, code, link
 *
 * Links go to https: or mailto: only (no javascript:, data:, or plain http).
 * Images come only from this event's own storage, which the server wrote
 * after decoding and re-encoding them.
 */

export type AboutMark =
	| { type: "bold" | "italic" | "underline" | "strike" | "code" }
	| { type: "link"; attrs: { href: string } };

export type AboutNode =
	| { type: "doc"; content: AboutNode[] }
	| { type: "paragraph"; content?: AboutNode[] }
	| { type: "heading"; attrs: { level: 1 | 2 | 3 }; content?: AboutNode[] }
	| { type: "bulletList"; content: AboutNode[] }
	| { type: "orderedList"; attrs: { start: number }; content: AboutNode[] }
	| { type: "listItem"; content: AboutNode[] }
	| { type: "blockquote"; content: AboutNode[] }
	| { type: "codeBlock"; content?: AboutNode[] }
	| { type: "horizontalRule" }
	| { type: "hardBreak" }
	| { type: "image"; attrs: { src: string; alt: string } }
	| { type: "text"; text: string; marks?: AboutMark[] };

export type AboutDoc = Extract<AboutNode, { type: "doc" }>;

/** Generous for an event description, small enough to read in one sitting. */
export const ABOUT_MAX_WORDS = 5000;
const MAX_TEXT_CHARS = 40_000;
const MAX_NODES = 4000;
const MAX_DEPTH = 12;
const MAX_IMAGES = 20;
const LINK_MAX = 2048;
const ALT_MAX = 250;

type Result =
	| { ok: true; doc: AboutDoc | null; words: number }
	| { ok: false; message: string };

class Rejected extends Error {}

const BLOCK_CONTAINERS = new Set([
	"paragraph",
	"heading",
	"bulletList",
	"orderedList",
	"listItem",
	"blockquote",
	"codeBlock",
]);
const SIMPLE_MARKS = new Set(["bold", "italic", "underline", "strike", "code"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** https: and mailto: only, well formed, of sane length. */
export function safeLink(href: unknown): string | null {
	if (typeof href !== "string" || href.length > LINK_MAX) return null;
	let url: URL;
	try {
		url = new URL(href.trim());
	} catch {
		return null;
	}
	if (url.protocol === "https:" && url.hostname) return url.href;
	if (url.protocol === "mailto:" && url.pathname.includes("@")) return url.href;
	return null;
}

function cleanMarks(marks: unknown): AboutMark[] | undefined {
	if (marks === undefined) return undefined;
	if (!Array.isArray(marks)) throw new Rejected("The text could not be read.");
	const out: AboutMark[] = [];
	for (const mark of marks) {
		if (!isRecord(mark) || typeof mark.type !== "string") continue;
		if (SIMPLE_MARKS.has(mark.type)) {
			out.push({ type: mark.type as "bold" });
		} else if (mark.type === "link") {
			const href = safeLink(isRecord(mark.attrs) ? mark.attrs.href : undefined);
			if (!href)
				throw new Rejected(
					"Links must start with https:// or be an email (mailto:).",
				);
			out.push({ type: "link", attrs: { href } });
		}
		// Anything else (a colour, a highlight) is dropped, not refused.
	}
	return out.length > 0 ? out : undefined;
}

/**
 * Rebuilds an editor document from what is allowed, or says why it cannot.
 * `imagePrefix` is the start of every address this event's own images have.
 * An empty document comes back as null: no About text.
 */
export function sanitizeAbout(
	input: unknown,
	{ imagePrefix }: { imagePrefix: string },
): Result {
	let nodes = 0;
	let chars = 0;
	let images = 0;
	let words = 0;

	function walk(node: unknown, depth: number): AboutNode | null {
		if (depth > MAX_DEPTH) throw new Rejected("The text is nested too deeply.");
		if (++nodes > MAX_NODES) throw new Rejected("The text is too long.");
		if (!isRecord(node) || typeof node.type !== "string")
			throw new Rejected("The text could not be read.");

		const children = (): AboutNode[] => {
			if (node.content === undefined) return [];
			if (!Array.isArray(node.content))
				throw new Rejected("The text could not be read.");
			return node.content
				.map((child) => walk(child, depth + 1))
				.filter((child): child is AboutNode => child !== null);
		};

		switch (node.type) {
			case "text": {
				if (typeof node.text !== "string" || node.text === "") return null;
				chars += node.text.length;
				words += node.text.trim().split(/\s+/).filter(Boolean).length;
				const marks = cleanMarks(node.marks);
				return marks
					? { type: "text", text: node.text, marks }
					: { type: "text", text: node.text };
			}
			case "hardBreak":
				return { type: "hardBreak" };
			case "horizontalRule":
				return { type: "horizontalRule" };
			case "image": {
				const attrs = isRecord(node.attrs) ? node.attrs : {};
				const src = typeof attrs.src === "string" ? attrs.src : "";
				if (
					!src.startsWith(imagePrefix) ||
					src.length > LINK_MAX ||
					/[\s"'<>]/.test(src) ||
					src.includes("..") ||
					src.includes("%2")
				)
					throw new Rejected(
						"Images must be uploaded here, not linked from elsewhere.",
					);
				if (++images > MAX_IMAGES)
					throw new Rejected(`Use at most ${MAX_IMAGES} images.`);
				const alt =
					typeof attrs.alt === "string" ? attrs.alt.slice(0, ALT_MAX) : "";
				return { type: "image", attrs: { src, alt } };
			}
			case "heading": {
				const level = isRecord(node.attrs) ? node.attrs.level : undefined;
				const safeLevel = level === 1 || level === 2 || level === 3 ? level : 2;
				const content = children();
				return content.length > 0
					? { type: "heading", attrs: { level: safeLevel }, content }
					: { type: "heading", attrs: { level: safeLevel } };
			}
			case "orderedList": {
				const start = isRecord(node.attrs) ? node.attrs.start : undefined;
				const safeStart =
					typeof start === "number" &&
					Number.isInteger(start) &&
					start >= 0 &&
					start < 100000
						? start
						: 1;
				return {
					type: "orderedList",
					attrs: { start: safeStart },
					content: children(),
				};
			}
			case "doc":
				if (depth !== 0) throw new Rejected("The text could not be read.");
				return { type: "doc", content: children() };
			default: {
				if (!BLOCK_CONTAINERS.has(node.type)) {
					// An unknown kind of block is dropped with what is in it.
					return null;
				}
				const content = children();
				if (node.type === "paragraph" || node.type === "codeBlock")
					return content.length > 0
						? { type: node.type, content }
						: { type: node.type };
				return { type: node.type as "listItem", content };
			}
		}
	}

	try {
		const doc = walk(input, 0);
		if (doc?.type !== "doc")
			return { ok: false, message: "The text could not be read." };
		if (chars > MAX_TEXT_CHARS || words > ABOUT_MAX_WORDS)
			return {
				ok: false,
				message: `Keep the About text under ${ABOUT_MAX_WORDS.toLocaleString("en-US")} words.`,
			};
		const empty = words === 0 && images === 0 && !hasRule(doc);
		return { ok: true, doc: empty ? null : doc, words };
	} catch (error) {
		if (error instanceof Rejected) return { ok: false, message: error.message };
		throw error;
	}
}

function hasRule(node: AboutNode): boolean {
	if (node.type === "horizontalRule") return true;
	return "content" in node && Array.isArray(node.content)
		? node.content.some(hasRule)
		: false;
}

/** Words in a stored document, for the counter and the public page's summary. */
export function aboutWords(doc: AboutNode | null): number {
	if (!doc) return 0;
	if (doc.type === "text")
		return doc.text.trim().split(/\s+/).filter(Boolean).length;
	return "content" in doc && Array.isArray(doc.content)
		? doc.content.reduce((sum, child) => sum + aboutWords(child), 0)
		: 0;
}
