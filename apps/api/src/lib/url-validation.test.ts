import { describe, expect, it } from "vitest";
import { imageUrl, linkUrl } from "./url-validation";

describe("linkUrl", () => {
	it.each([
		"javascript:alert(1)",
		"JAVASCRIPT:alert(1)",
		"  javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"vbscript:msgbox(1)",
		"file:///etc/passwd",
		"mailto:a@example.com",
		"ftp://example.com/file",
	])("rejects %j", (value) => {
		expect(linkUrl.safeParse(value).success).toBe(false);
	});

	it("rejects strings that are not URLs", () => {
		expect(linkUrl.safeParse("https://").success).toBe(false);
		expect(linkUrl.safeParse("not a url at all").success).toBe(false);
	});

	it("accepts http and https links", () => {
		expect(linkUrl.parse("https://meet.example.com/abc")).toBe(
			"https://meet.example.com/abc",
		);
		expect(linkUrl.parse("http://legacy.example.com")).toBe(
			"http://legacy.example.com/",
		);
	});

	it("prefixes https:// to a bare domain, like the UI already does", () => {
		expect(linkUrl.parse("example.com/page")).toBe("https://example.com/page");
	});

	it("treats an empty value as cleared", () => {
		expect(linkUrl.parse("   ")).toBeNull();
	});
});

describe("imageUrl", () => {
	it.each([
		"javascript:alert(1)",
		"data:image/svg+xml,<svg onload=alert(1)>",
		"http://example.com/logo.png",
	])("rejects %j", (value) => {
		expect(imageUrl.safeParse(value).success).toBe(false);
	});

	it("accepts https images", () => {
		expect(imageUrl.parse("https://cdn.example.com/logo.png")).toBe(
			"https://cdn.example.com/logo.png",
		);
	});
});
