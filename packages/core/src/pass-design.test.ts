import assert from "node:assert/strict";
import { test } from "node:test";
import {
	clampLayer,
	contrastRatio,
	defaultPassDesign,
	layerText,
	lowContrast,
	type PassDesign,
	type PassValues,
	passDesign,
	renderPass,
	SAMPLE_CODE,
} from "./pass-design.ts";
import { PASS_ARTWORK, PASS_DESIGN_IDS } from "./pass-designs.ts";

const values: PassValues = {
	event_title: "Summit",
	ticket_name: "General",
	guest_name: "Asha Rao",
	event_date: "Sat, 28 Nov 2026",
	event_time: "10:00 AM",
	venue: "Hall A",
	ticket_code: "MME-7K2Q-9F4B",
	answers: {},
};
const fonts = { display: "serif", body: "sans-serif", mono: "monospace" };

test("every design's default layout passes its own rules", () => {
	for (const id of PASS_DESIGN_IDS)
		assert.equal(passDesign.safeParse(defaultPassDesign(id)).success, true, id);
	assert.equal(PASS_DESIGN_IDS.length, 21);
	assert.equal(new Set(PASS_DESIGN_IDS).size, 21);
});

test("a pass has exactly one entry code, inside the safe area", () => {
	const base = defaultPassDesign();
	const noCode: PassDesign = {
		...base,
		layers: base.layers.filter((l) => l.kind !== "qr"),
	};
	assert.equal(passDesign.safeParse(noCode).success, false);
	const outside: PassDesign = {
		...base,
		layers: base.layers.map((l) => (l.kind === "qr" ? { ...l, x: 680 } : l)),
	};
	assert.equal(passDesign.safeParse(outside).success, false);
	const back = outside.layers.map(clampLayer);
	assert.equal(
		passDesign.safeParse({ ...outside, layers: back }).success,
		true,
	);
});

test("words are escaped and long ones cut to the layer's width", () => {
	const design = defaultPassDesign();
	const svg = renderPass({
		design,
		values: { ...values, guest_name: '<script>alert("x")</script> & co' },
		code: SAMPLE_CODE,
		fonts,
		uid: "t",
	});
	assert.equal(svg.includes("<script>"), false);
	assert.match(svg, /&lt;script&gt;/);
	const ticket = design.layers.find((l) => l.id === "ticket");
	assert.ok(ticket && ticket.kind === "text");
	const long = layerText(ticket, { ...values, ticket_name: "x".repeat(200) });
	assert.ok(long.length < 40 && long.endsWith("…"));
});

test("own words and answers fill their layers", () => {
	const id = "11111111-1111-4111-8111-111111111111";
	const layer = {
		id: "t1",
		kind: "text" as const,
		source: { type: "question" as const, fieldId: id },
		x: 40,
		y: 40,
		width: 300,
		size: "m" as const,
		weight: "regular" as const,
		colour: "ink" as const,
	};
	assert.equal(
		layerText(layer, { ...values, answers: { [id]: "Team Rocket" } }),
		"Team Rocket",
	);
	assert.equal(layerText(layer, values), "");
});

test("each design's main text reads on its ground", () => {
	for (const art of PASS_ARTWORK) {
		assert.ok(contrastRatio(art.ink, art.ground) >= 4.5, art.id);
		assert.ok(contrastRatio(art.soft, art.ground) >= 4.5, `${art.id} soft`);
	}
	const layer = defaultPassDesign().layers.find((l) => l.id === "guest");
	assert.ok(layer && layer.kind === "text");
	assert.equal(lowContrast(layer, { base: "classic", accent: null }), false);
	// Classic's own accent is its tear line: too pale for text on its blue.
	assert.equal(
		lowContrast(
			{ ...layer, colour: "accent" },
			{ base: "classic", accent: null },
		),
		true,
	);
});

test("a retired code leaves its tile and words, never the code", () => {
	const svg = renderPass({
		design: defaultPassDesign(),
		values,
		code: null,
		retired: "Event\nended",
		fonts,
		uid: "r",
	});
	assert.equal(svg.includes(SAMPLE_CODE.path), false);
	assert.match(svg, />Event<\/text>.*>ended<\/text>/);
});
