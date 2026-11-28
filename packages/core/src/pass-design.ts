import { z } from "zod";
import {
	accentColour,
	PASS_ACCENT_KEYS,
	PASS_DESIGN_IDS,
	PASS_HEIGHT,
	PASS_WIDTH,
	type PassArtwork,
	passArtwork,
} from "./pass-designs.ts";

/**
 * A ticket's pass design: which artwork, its accent, and the layers on it,
 * the entry code and the text. Checked the same way in the editor and on
 * the server; the database holds the outline again (ticket_designs).
 *
 * Positions are in the pass's own units, 720 × 280, from the top left.
 * Everything stays inside the safe area, SAFE from each edge, so nothing is
 * cut when a pass is printed or cropped into a phone's wallet.
 */

export const PASS_SAFE = 24;
export const PASS_LAYERS_MAX = 12;
export const PASS_OWN_TEXT_MAX = 60;
export const PASS_QR_MIN = 88;
export const PASS_QR_MAX = 184;

/** What a text layer can show, besides an answer or the organizer's words. */
export const PASS_FIELDS = [
	"event_title",
	"ticket_name",
	"guest_name",
	"event_date",
	"event_time",
	"venue",
	"ticket_code",
] as const;
export type PassField = (typeof PASS_FIELDS)[number];

export const PASS_FIELD_LABELS: Record<PassField, string> = {
	event_title: "Event title",
	ticket_name: "Ticket name",
	guest_name: "Guest name",
	event_date: "Date",
	event_time: "Time",
	venue: "Venue",
	ticket_code: "Ticket code",
};

/** Font sizes, in pass units. */
export const PASS_TEXT_SIZES = { s: 13, m: 18, l: 26, xl: 36 } as const;
export type PassTextSize = keyof typeof PASS_TEXT_SIZES;
export const PASS_SIZE_NAMES: Record<PassTextSize, string> = {
	s: "Small",
	m: "Medium",
	l: "Large",
	xl: "Huge",
};

export const PASS_COLOUR_KEYS = ["ink", "soft", "accent"] as const;
export type PassColour = (typeof PASS_COLOUR_KEYS)[number];
export const PASS_COLOUR_NAMES: Record<PassColour, string> = {
	ink: "Main",
	soft: "Soft",
	accent: "Accent",
};

const x = z.number().int().min(0).max(PASS_WIDTH);
const y = z.number().int().min(0).max(PASS_HEIGHT);

const textSource = z.discriminatedUnion("type", [
	z.object({ type: z.literal("field"), field: z.enum(PASS_FIELDS) }),
	z.object({ type: z.literal("question"), fieldId: z.uuid() }),
	z.object({
		type: z.literal("own"),
		text: z.string().trim().min(1).max(PASS_OWN_TEXT_MAX),
	}),
]);
export type PassTextSource = z.infer<typeof textSource>;

const textLayer = z.object({
	id: z.string().regex(/^[a-z0-9]{1,12}$/),
	kind: z.literal("text"),
	source: textSource,
	x,
	y,
	width: z
		.number()
		.int()
		.min(40)
		.max(PASS_WIDTH - 2 * PASS_SAFE),
	size: z.enum(["s", "m", "l", "xl"]),
	weight: z.enum(["regular", "bold"]),
	colour: z.enum(PASS_COLOUR_KEYS),
});
export type PassTextLayer = z.infer<typeof textLayer>;

const qrLayer = z.object({
	id: z.literal("qr"),
	kind: z.literal("qr"),
	x,
	y,
	size: z.number().int().min(PASS_QR_MIN).max(PASS_QR_MAX),
});
export type PassQrLayer = z.infer<typeof qrLayer>;

export type PassLayer = PassTextLayer | PassQrLayer;

/** A layer's box, in pass units. Text: one line, its set width. */
export function layerBox(layer: PassLayer): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	if (layer.kind === "qr")
		return { x: layer.x, y: layer.y, width: layer.size, height: layer.size };
	return {
		x: layer.x,
		y: layer.y,
		width: layer.width,
		height: Math.ceil(PASS_TEXT_SIZES[layer.size] * 1.25),
	};
}

/** Moved back inside the safe area, keeping its size. */
export function clampLayer<L extends PassLayer>(layer: L): L {
	const box = layerBox(layer);
	const max = (span: number, room: number) => room - PASS_SAFE - span;
	return {
		...layer,
		x: Math.round(
			Math.min(Math.max(layer.x, PASS_SAFE), max(box.width, PASS_WIDTH)),
		),
		y: Math.round(
			Math.min(Math.max(layer.y, PASS_SAFE), max(box.height, PASS_HEIGHT)),
		),
	};
}

function inside(layer: PassLayer): boolean {
	const b = layerBox(layer);
	return (
		b.x >= PASS_SAFE &&
		b.y >= PASS_SAFE &&
		b.x + b.width <= PASS_WIDTH - PASS_SAFE &&
		b.y + b.height <= PASS_HEIGHT - PASS_SAFE
	);
}

export const passDesign = z
	.object({
		base: z.enum(PASS_DESIGN_IDS),
		accent: z.enum(PASS_ACCENT_KEYS).nullable(),
		layers: z
			.array(z.discriminatedUnion("kind", [qrLayer, textLayer]))
			.min(1)
			.max(PASS_LAYERS_MAX),
	})
	.superRefine((design, ctx) => {
		const codes = design.layers.filter((l) => l.kind === "qr").length;
		if (codes !== 1)
			ctx.addIssue({
				code: "custom",
				message: "A pass has exactly one entry code.",
			});
		const ids = new Set(design.layers.map((l) => l.id));
		if (ids.size !== design.layers.length)
			ctx.addIssue({ code: "custom", message: "Layer ids repeat." });
		if (!design.layers.every(inside))
			ctx.addIssue({
				code: "custom",
				message: "Keep every layer inside the dashed line.",
			});
	});
export type PassDesign = z.infer<typeof passDesign>;

// ---- Defaults ---------------------------------------------------------------

/**
 * The layout every ticket starts with. With no design named, Midnight
 * Orbital in the brand's green: the design a ticket has until someone picks
 * another. With one named, that design in its own accent.
 */
export function defaultPassDesign(base?: PassDesign["base"]): PassDesign {
	return {
		base: base ?? "midnight-orbital",
		accent: base ? null : "green",
		layers: [
			{ id: "qr", kind: "qr", x: 584, y: 84, size: 112 },
			{
				id: "event",
				kind: "text",
				source: { type: "field", field: "event_title" },
				x: 40,
				y: 40,
				width: 420,
				size: "s",
				weight: "regular",
				colour: "soft",
			},
			{
				id: "ticket",
				kind: "text",
				source: { type: "field", field: "ticket_name" },
				x: 40,
				y: 62,
				width: 420,
				size: "xl",
				weight: "bold",
				colour: "ink",
			},
			{
				id: "label",
				kind: "text",
				source: { type: "own", text: "Guest" },
				x: 40,
				y: 150,
				width: 300,
				size: "s",
				weight: "regular",
				colour: "soft",
			},
			{
				id: "guest",
				kind: "text",
				source: { type: "field", field: "guest_name" },
				x: 40,
				y: 168,
				width: 420,
				size: "m",
				weight: "bold",
				colour: "ink",
			},
			{
				id: "date",
				kind: "text",
				source: { type: "field", field: "event_date" },
				x: 40,
				y: 222,
				width: 200,
				size: "s",
				weight: "regular",
				colour: "ink",
			},
			{
				id: "time",
				kind: "text",
				source: { type: "field", field: "event_time" },
				x: 250,
				y: 222,
				width: 120,
				size: "s",
				weight: "regular",
				colour: "ink",
			},
		],
	};
}

/** A new text layer's id: short, and not one the design has. */
export function newLayerId(design: PassDesign): string {
	const taken = new Set(design.layers.map((l) => l.id));
	for (let n = 1; ; n++) {
		const id = `t${n}`;
		if (!taken.has(id)) return id;
	}
}

// ---- What the text says ------------------------------------------------------

/** The words for each source on one pass. Answers by form field id. */
export type PassValues = Record<PassField, string> & {
	answers: Readonly<Record<string, string>>;
};

/** Roughly how many characters fit: the average glyph is about 0.55 em. */
function fits(text: string, width: number, fontSize: number): string {
	const room = Math.max(1, Math.floor(width / (fontSize * 0.56)));
	const chars = Array.from(text);
	return chars.length <= room
		? text
		: `${chars
				.slice(0, room - 1)
				.join("")
				.trimEnd()}…`;
}

export function layerText(layer: PassTextLayer, values: PassValues): string {
	const raw =
		layer.source.type === "own"
			? layer.source.text
			: layer.source.type === "field"
				? values[layer.source.field]
				: (values.answers[layer.source.fieldId] ?? "");
	return fits(
		raw.replace(/\s+/g, " ").trim(),
		layer.width,
		PASS_TEXT_SIZES[layer.size],
	);
}

/** Which face a layer is set in: big text in the display face, codes in mono. */
export function layerFace(layer: PassTextLayer): "display" | "body" | "mono" {
	if (layer.source.type === "field" && layer.source.field === "ticket_code")
		return "mono";
	return layer.size === "l" || layer.size === "xl" ? "display" : "body";
}

export function layerColour(
	layer: PassTextLayer,
	art: PassArtwork,
	accent: string,
): string {
	return layer.colour === "accent"
		? accent
		: layer.colour === "soft"
			? art.soft
			: art.ink;
}

// ---- Contrast ----------------------------------------------------------------

function luminance(hex: string): number {
	const n = Number.parseInt(hex.slice(1), 16);
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * channel((n >> 16) & 255) +
		0.7152 * channel((n >> 8) & 255) +
		0.0722 * channel(n & 255)
	);
}

export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [
		number,
		number,
	];
	return (hi + 0.05) / (lo + 0.05);
}

/** True when the layer's colour is hard to read on its design's ground. */
export function lowContrast(
	layer: PassTextLayer,
	design: Pick<PassDesign, "base" | "accent">,
): boolean {
	const art = passArtwork(design.base);
	const colour = layerColour(
		layer,
		art,
		accentColour(design.base, design.accent),
	);
	const large = PASS_TEXT_SIZES[layer.size] >= 26;
	return contrastRatio(colour, art.ground) < (large ? 3 : 4.5);
}

// ---- Drawing ------------------------------------------------------------------

export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Font stacks per face: the page passes its own (CSS variables) or names. */
export type PassFonts = { display: string; body: string; mono: string };

/** Dark modules of a QR, in module units, quiet zone not included. */
export type PassCode = { modules: number; path: string };

/** The entry code is ink on surface, as everywhere (design-spec.md). */
const CODE_DARK = "#1b1a18";
const CODE_LIGHT = "#fefdfc";

/** The QR on its tile: a two-module quiet zone, so any scanner reads it. */
export function codeMarkup(layer: PassQrLayer, code: PassCode): string {
	const unit = layer.size / (code.modules + 4);
	return `<rect x="${layer.x}" y="${layer.y}" width="${layer.size}" height="${layer.size}" rx="6" fill="${CODE_LIGHT}"/><path transform="translate(${layer.x + 2 * unit} ${layer.y + 2 * unit}) scale(${unit})" d="${code.path}" fill="${CODE_DARK}"/>`;
}

/**
 * Where the code was, once it no longer lets anyone in: the same tile, with
 * the words instead of the code, so the pass keeps its shape.
 */
export function retiredCodeMarkup(
	layer: PassQrLayer,
	words: string,
	fonts: PassFonts,
): string {
	const cx = layer.x + layer.size / 2;
	const cy = layer.y + layer.size / 2;
	const lines = words.split("\n").slice(0, 3);
	const step = 16;
	const top = cy - ((lines.length - 1) * step) / 2 + 5;
	const text = lines
		.map(
			(line, i) =>
				`<text x="${cx}" y="${top + i * step}" text-anchor="middle" font-size="13" fill="#57534e" style="font-family:${escapeXml(fonts.body)}">${escapeXml(line)}</text>`,
		)
		.join("");
	return `<rect x="${layer.x}" y="${layer.y}" width="${layer.size}" height="${layer.size}" rx="6" fill="${CODE_LIGHT}"/>${text}`;
}

export function textMarkup(
	layer: PassTextLayer,
	text: string,
	art: PassArtwork,
	accent: string,
	fonts: PassFonts,
): string {
	const size = PASS_TEXT_SIZES[layer.size];
	const face = fonts[layerFace(layer)];
	return `<text x="${layer.x}" y="${layer.y + Math.round(size * 0.95)}" font-size="${size}" font-weight="${layer.weight === "bold" ? 700 : 400}" fill="${layerColour(layer, art, accent)}" style="font-family:${escapeXml(face)}">${escapeXml(text)}</text>`;
}

/** The artwork alone: what the design strip shows. */
export function artworkMarkup(
	design: Pick<PassDesign, "base" | "accent">,
	uid: string,
): string {
	const safe = uid.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "p";
	return passArtwork(design.base).draw(
		accentColour(design.base, design.accent),
		safe,
	);
}

/**
 * A whole pass as one SVG: the artwork, then each layer in order. Every
 * word is escaped; the only markup is ours. `code` is the guest's QR, or a
 * sample's; null once it no longer lets anyone in, when `retired` says why
 * in its place (a line each, up to three).
 */
export function renderPass(options: {
	design: PassDesign;
	values: PassValues;
	code: PassCode | null;
	retired?: string;
	fonts: PassFonts;
	uid: string;
	title?: string;
}): string {
	const { design, values, code, fonts, uid } = options;
	const art = passArtwork(design.base);
	const accent = accentColour(design.base, design.accent);
	const layers = design.layers
		.map((layer) =>
			layer.kind === "qr"
				? code
					? codeMarkup(layer, code)
					: retiredCodeMarkup(layer, options.retired ?? "No code", fonts)
				: textMarkup(layer, layerText(layer, values), art, accent, fonts),
		)
		.join("");
	const label = options.title
		? `<title>${escapeXml(options.title)}</title>`
		: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PASS_WIDTH} ${PASS_HEIGHT}" width="${PASS_WIDTH}" height="${PASS_HEIGHT}" role="img">${label}${artworkMarkup(design, uid)}${layers}</svg>`;
}

// ---- Samples -------------------------------------------------------------------

/**
 * A drawn stand-in for a QR: three finder squares and scattered cells, 25
 * modules. It encodes nothing; a real pass carries a signed token.
 */
export const SAMPLE_CODE: PassCode = (() => {
	const n = 25;
	const cells: string[] = [];
	const finder = (cx: number, cy: number) => {
		cells.push(
			`M${cx} ${cy}h7v7h-7zM${cx + 1} ${cy + 1}v5h5v-5zM${cx + 2} ${cy + 2}h3v3h-3z`,
		);
	};
	finder(0, 0);
	finder(n - 7, 0);
	finder(0, n - 7);
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const inFinder =
				(r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
			if (!inFinder && (r * 7 + c * 13 + r * c) % 5 < 2)
				cells.push(`M${c} ${r}h1v1h-1z`);
		}
	return { modules: n, path: cells.join("") };
})();

export const SAMPLE_GUEST = {
	guest_name: "Asha Rao",
	ticket_code: "MME-7K2Q-9F4B",
} as const;
