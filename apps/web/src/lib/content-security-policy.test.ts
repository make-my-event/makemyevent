// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildContentSecurityPolicy,
	createNonce,
} from "./content-security-policy";

// The exact pattern Next.js uses to extract the nonce from the CSP header
// (next/dist/server/app-render/get-script-nonce-from-header.js).
const NEXT_NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;

const directive = (csp: string, name: string) =>
	csp
		.split(";")
		.map((d) => d.trim())
		.find((d) => d.startsWith(`${name} `)) ?? "";

describe("createNonce", () => {
	it("is fresh each time and in the format Next.js extracts", () => {
		const a = createNonce();
		const b = createNonce();
		expect(a).not.toBe(b);
		expect(`'nonce-${a}'`).toMatch(NEXT_NONCE_SOURCE);
		expect(atob(a)).toHaveLength(16);
	});
});

describe("buildContentSecurityPolicy", () => {
	const nonce = createNonce();
	const prod = buildContentSecurityPolicy({ nonce, isDev: false });

	it("allows scripts only from this origin with the request's nonce", () => {
		const scripts = directive(prod, "script-src");
		expect(scripts).toContain(`'nonce-${nonce}'`);
		expect(scripts).toContain("'strict-dynamic'");
		expect(scripts).not.toContain("'unsafe-inline'");
		expect(scripts).not.toContain("'unsafe-eval'");
		// Next.js finds the nonce in it.
		expect(scripts.split(/\s+/).some((s) => NEXT_NONCE_SOURCE.test(s))).toBe(
			true,
		);
	});

	it("blocks plugins, framing and base-tag hijacking, and reports violations", () => {
		expect(directive(prod, "object-src")).toBe("object-src 'none'");
		expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
		expect(directive(prod, "base-uri")).toBe("base-uri 'self'");
		expect(directive(prod, "report-uri")).toBe("report-uri /api/csp-report");
	});

	it("adds development-only allowances only in development", () => {
		const dev = buildContentSecurityPolicy({ nonce, isDev: true });
		expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
		expect(directive(dev, "connect-src")).toContain("ws:");
		expect(directive(prod, "connect-src")).not.toContain("ws:");
	});
});
