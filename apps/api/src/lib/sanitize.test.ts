import { describe, expect, it } from "vitest";
import { sanitizeOptionalRichText, sanitizeRichText } from "./sanitize";

describe("sanitizeRichText", () => {
	describe("removes script execution vectors", () => {
		const cases: Array<[string, string]> = [
			["script tag", "<p>hi</p><script>alert(1)</script>"],
			["img onerror", '<p>hi</p><img src="x" onerror="alert(1)">'],
			["svg onload", "<svg onload=alert(1)></svg><p>hi</p>"],
			["iframe", '<iframe src="https://evil.example"></iframe><p>hi</p>'],
			["event handler on allowed tag", '<p onclick="alert(1)">hi</p>'],
			["style tag", "<style>body{display:none}</style><p>hi</p>"],
			["object", '<object data="x.swf"></object><p>hi</p>'],
			["form", '<form action="https://evil.example"><p>hi</p></form>'],
			[
				"meta refresh",
				'<meta http-equiv="refresh" content="0;url=x"><p>hi</p>',
			],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				const out = sanitizeRichText(input);
				expect(out).not.toMatch(
					/<script|onerror|onload|onclick|<iframe|<style|<object|<form|<meta|<svg|<img/i,
				);
				expect(out).toContain("hi");
			});
		}
	});

	describe("removes dangerous link targets", () => {
		const hrefs = [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			" javascript:alert(1)",
			"java\tscript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"vbscript:msgbox(1)",
			"//evil.example/path",
		];
		for (const href of hrefs) {
			it(JSON.stringify(href), () => {
				const out = sanitizeRichText(`<p><a href="${href}">x</a></p>`);
				expect(out).not.toMatch(/href=/i);
				expect(out).toContain(">x</a>");
			});
		}
	});

	it("strips inline styles other than alignment and table widths", () => {
		const out = sanitizeRichText(
			'<p style="text-align: center; background: url(javascript:alert(1)); position: fixed">a</p>',
		);
		expect(out).toBe('<p style="text-align:center">a</p>');
	});

	it("drops non-checkbox inputs", () => {
		expect(sanitizeRichText('<p>a</p><input type="text" value="x">')).toBe(
			"<p>a</p>",
		);
	});

	it("forces safe rel and target on links", () => {
		expect(
			sanitizeRichText(
				'<p><a href="https://example.com" target="_self">x</a></p>',
			),
		).toBe(
			'<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
		);
	});

	describe("keeps RichTextEditor output unchanged", () => {
		// Representative HTML in the exact shape Tiptap's getHTML() produces for
		// the extensions configured in apps/web/src/components/ui/rich-text-editor.tsx.
		const editorOutput: Array<[string, string]> = [
			["paragraph", "<p>Hello &amp; welcome, 3 &lt; 4</p>"],
			[
				"headings with alignment",
				'<h1 style="text-align: center">T</h1><h2>S</h2><h3 style="text-align: right">x</h3>',
			],
			[
				"marks",
				"<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <code>c</code></p>",
			],
			[
				"link",
				'<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/a?b=1&amp;c=2">link</a></p>',
			],
			[
				"mailto link",
				'<p><a target="_blank" rel="noopener noreferrer nofollow" href="mailto:team@example.com">mail</a></p>',
			],
			[
				"lists",
				'<ul><li><p>a</p></li></ul><ol start="3"><li><p>b</p></li></ol>',
			],
			["blockquote and rule", "<blockquote><p>q</p></blockquote><hr>"],
			[
				"code block",
				'<pre><code class="language-ts">const a = 1;</code></pre>',
			],
			[
				"task list",
				'<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li></ul>',
			],
			[
				"table",
				'<table style="min-width: 50px"><colgroup><col style="min-width: 25px"><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>h</p></th><td colspan="1" rowspan="1"><p>d</p></td></tr></tbody></table>',
			],
		];

		// sanitize-html serialises equivalently but not byte-identically: it drops
		// whitespace inside style values ("a: b" -> "a:b") and writes void
		// elements as "<hr />". Apply only those two normalisations to both sides
		// so any real change to tags, attributes or text still fails the test.
		const normalise = (html: string) =>
			html
				.replace(
					/style="([^"]*)"/g,
					(_m, s: string) => `style="${s.replace(/:\s+/g, ":")}"`,
				)
				.replace(/\s*\/>/g, ">");

		for (const [name, html] of editorOutput) {
			it(name, () => {
				expect(normalise(sanitizeRichText(html))).toBe(normalise(html));
			});
		}
	});
});

describe("sanitizeOptionalRichText", () => {
	it("keeps undefined (field not sent) distinct from null (cleared)", () => {
		expect(sanitizeOptionalRichText(undefined)).toBeUndefined();
		expect(sanitizeOptionalRichText(null)).toBeNull();
	});

	it("maps content that sanitizes to nothing to null", () => {
		expect(sanitizeOptionalRichText("<script>alert(1)</script>")).toBeNull();
		expect(sanitizeOptionalRichText("   ")).toBeNull();
	});
});
