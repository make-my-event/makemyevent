import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./safe-callback-url";

describe("safeCallbackUrl", () => {
	it.each([
		"javascript:alert(document.domain)",
		"JavaScript:alert(1)",
		" javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"https://evil.example/login",
		"http://evil.example",
		"//evil.example",
		"///evil.example",
		"/\\evil.example",
		"\\\\evil.example",
		"/\t/evil.example",
		"/\n/evil.example",
		"/\r/evil.example",
		"evil.example",
		"dashboard",
	])("rejects %j and falls back to /dashboard", (value) => {
		expect(safeCallbackUrl(value)).toBe("/dashboard");
	});

	it("uses the default when nothing is given", () => {
		expect(safeCallbackUrl(null)).toBe("/dashboard");
		expect(safeCallbackUrl(undefined)).toBe("/dashboard");
		expect(safeCallbackUrl("")).toBe("/dashboard");
	});

	it.each([
		["/events/tech-meetup/rsvp", "/events/tech-meetup/rsvp"],
		["/organization/acme", "/organization/acme"],
		["/dashboard?tab=events#top", "/dashboard?tab=events#top"],
		["/onboarding", "/onboarding"],
		// An encoded newline is just a literal path segment on this site.
		["/%0a/evil.example", "/%0a/evil.example"],
	])("keeps same-site path %j", (value, expected) => {
		expect(safeCallbackUrl(value)).toBe(expected);
	});
});
