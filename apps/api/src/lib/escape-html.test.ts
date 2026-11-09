import { describe, expect, it } from "vitest";
import { escapeHtml, toHeaderText } from "./escape-html";

describe("escapeHtml", () => {
	it("escapes every character that can open a tag or leave an attribute", () => {
		expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
			"&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
		);
	});

	it("turns an injected phishing button into inert text", () => {
		const name =
			'Sam</strong><a href="https://evil.example/login">Verify your account</a>';
		const html = `<strong>${escapeHtml(name)}</strong>`;
		expect(html).not.toContain("<a ");
		expect(html).toContain(
			"&lt;a href=&quot;https://evil.example/login&quot;&gt;",
		);
	});

	it("leaves ordinary text unchanged", () => {
		expect(escapeHtml("Priya Nair, Tech Meetup 2026")).toBe(
			"Priya Nair, Tech Meetup 2026",
		);
	});
});

describe("toHeaderText", () => {
	it("removes line breaks that could start a new header", () => {
		expect(toHeaderText("Hello\r\nBcc: victim@example.com")).toBe(
			"Hello Bcc: victim@example.com",
		);
	});

	it("collapses whitespace and trims", () => {
		expect(toHeaderText("  A\t\tB  ")).toBe("A B");
	});
});
