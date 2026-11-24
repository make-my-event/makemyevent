import assert from "node:assert/strict";
import { test } from "node:test";
import { aboutWords, safeLink, sanitizeAbout } from "./about.ts";

const PREFIX =
	"https://x.supabase.co/storage/v1/object/public/event-media/events/e1/";
const clean = (doc: unknown) => sanitizeAbout(doc, { imagePrefix: PREFIX });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: unknown[]) => ({
	type: "text",
	text,
	...(marks ? { marks } : {}),
});
const doc = (...content: unknown[]) => ({ type: "doc", content });

test("keeps everything the toolbar makes", () => {
	const input = doc(
		{ type: "heading", attrs: { level: 1 }, content: [t("Design Summit")] },
		p(
			t("Join "),
			t("makers", [{ type: "bold" }, { type: "italic" }]),
			t(" and "),
			t("more", [{ type: "underline" }, { type: "strike" }]),
		),
		{
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [p(t("Doors at "), t("09:00", [{ type: "code" }]))],
				},
			],
		},
		{
			type: "orderedList",
			attrs: { start: 3 },
			content: [{ type: "listItem", content: [p(t("Third"))] }],
		},
		{ type: "blockquote", content: [p(t("Quote"))] },
		{ type: "codeBlock", content: [t("npm i")] },
		{ type: "horizontalRule" },
		p(
			t("Site", [
				{ type: "link", attrs: { href: "https://makemyevent.org/a" } },
			]),
			{ type: "hardBreak" },
			t("Mail", [{ type: "link", attrs: { href: "mailto:hi@x.org" } }]),
		),
		{ type: "image", attrs: { src: `${PREFIX}about-1.webp`, alt: "Stage" } },
	);
	const result = clean(input);
	assert.ok(result.ok);
	assert.deepEqual(result.doc, input);
	assert.equal(result.words, 15);
	assert.equal(aboutWords(result.ok ? result.doc : null), 15);
});

test("drops what the editor never makes, and extra attributes", () => {
	const result = clean(
		doc(
			{
				type: "paragraph",
				attrs: { style: "x" },
				content: [t("hi", [{ type: "highlight", attrs: { color: "red" } }])],
			},
			{
				type: "iframe",
				attrs: { src: "https://evil.example" },
				content: [t("gone")],
			},
			{ type: "heading", attrs: { level: 6, onclick: "x" }, content: [t("h")] },
		),
	);
	assert.ok(result.ok);
	assert.deepEqual(
		result.doc,
		doc(p(t("hi")), {
			type: "heading",
			attrs: { level: 2 },
			content: [t("h")],
		}),
	);
});

test("refuses unsafe links and images from elsewhere", () => {
	for (const href of [
		"javascript:alert(1)",
		"JaVaScRiPt:alert(1)",
		"data:text/html,<script>x</script>",
		"http://plain.example",
		"vbscript:x",
		"//evil.example",
		"mailto:nobody",
	]) {
		const result = clean(doc(p(t("x", [{ type: "link", attrs: { href } }]))));
		assert.equal(result.ok, false, href);
	}
	for (const src of [
		"https://evil.example/a.webp",
		`${PREFIX}a.webp" onerror="x`,
		"javascript:alert(1)",
		`https://x.supabase.co/storage/v1/object/public/event-media/events/OTHER/a.webp`,
	]) {
		assert.equal(
			clean(doc({ type: "image", attrs: { src, alt: "" } })).ok,
			false,
			src,
		);
	}
	assert.equal(
		safeLink(" https://ok.example/path?q=1 "),
		"https://ok.example/path?q=1",
	);
});

test("refuses junk, deep nesting and huge texts; empty is null", () => {
	assert.equal(clean("not a doc").ok, false);
	assert.equal(clean({ type: "doc", content: "x" }).ok, false);
	let deep: unknown = p(t("x"));
	for (let i = 0; i < 20; i++) deep = { type: "blockquote", content: [deep] };
	assert.equal(clean(doc(deep)).ok, false);
	assert.equal(clean(doc(p(t("word ".repeat(5001))))).ok, false);
	const empty = clean(doc(p(), p()));
	assert.ok(empty.ok);
	assert.equal(empty.doc, null);
});
