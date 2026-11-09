import { describe, expect, it } from "vitest";
import { redactUrl, summarizeCspReports } from "./csp-report";

describe("redactUrl", () => {
	it("drops query strings and fragments", () => {
		expect(
			redactUrl(
				"https://app.test/reset-password?token=abcdefghijklmnopqrstuvwxyz#x",
			),
		).toBe("https://app.test/reset-password");
	});

	it("replaces token-like path segments", () => {
		expect(
			redactUrl("https://app.test/tickets/Zx9_k2LmQp7rTt0vWbYc3dEfGhIjKlMn"),
		).toBe("https://app.test/tickets/:token");
		expect(redactUrl("https://app.test/events/tech-meetup/rsvp")).toBe(
			"https://app.test/events/tech-meetup/rsvp",
		);
	});

	it("keeps CSP keywords and caps length", () => {
		expect(redactUrl("inline")).toBe("inline");
		expect(
			redactUrl(`https://app.test/${"a".repeat(19)}/${"b/".repeat(200)}`)
				.length,
		).toBeLessThanOrEqual(201);
		expect(redactUrl(42)).toBe("");
	});
});

describe("summarizeCspReports", () => {
	it("reads the legacy report-uri format", () => {
		expect(
			summarizeCspReports({
				"csp-report": {
					"document-uri":
						"https://app.test/invite/AbCdEfGhIjKlMnOpQrStUvWxYz012345",
					"violated-directive": "script-src-elem",
					"blocked-uri": "https://evil.example/x.js?secret=1",
					"source-file": "https://app.test/page",
					"line-number": 3,
				},
			}),
		).toEqual([
			{
				directive: "script-src-elem",
				blocked: "https://evil.example/x.js",
				page: "https://app.test/invite/:token",
				source: "https://app.test/page",
				line: 3,
			},
		]);
	});

	it("reads the Reporting API format and caps the number of entries", () => {
		const entry = {
			type: "csp-violation",
			body: {
				documentURL: "https://app.test/",
				effectiveDirective: "img-src",
				blockedURL: "inline",
			},
		};
		const result = summarizeCspReports(Array.from({ length: 50 }, () => entry));
		expect(result).toHaveLength(20);
		expect(result[0]).toMatchObject({
			directive: "img-src",
			blocked: "inline",
			line: null,
		});
	});

	it("ignores anything it does not recognise", () => {
		expect(summarizeCspReports("nope")).toEqual([]);
		expect(summarizeCspReports({ other: 1 })).toEqual([]);
		expect(summarizeCspReports([1, null, { body: "x" }])).toEqual([]);
	});
});
