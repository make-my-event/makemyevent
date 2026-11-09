// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security headers (next.config)", () => {
	it("sends the security headers on every path", async () => {
		const rules = (await nextConfig.headers?.()) ?? [];
		const all = rules.find((rule) => rule.source === "/:path*");
		const headers = Object.fromEntries(
			(all?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]),
		);
		expect(headers["strict-transport-security"]).toMatch(/max-age=\d{8,}/);
		expect(headers["x-content-type-options"]).toBe("nosniff");
		expect(headers["x-frame-options"]).toBe("DENY");
		expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(headers["permissions-policy"]).toContain("camera=(self)");
		expect(headers["permissions-policy"]).toContain("microphone=()");
	});

	it("hides the framework banner and has no tunnel dev origins", () => {
		expect(nextConfig.poweredByHeader).toBe(false);
		expect(nextConfig.allowedDevOrigins).toBeUndefined();
	});
});
