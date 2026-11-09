// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { limiter } = vi.hoisted(() => ({
	limiter: { mode: "allow" as "allow" | "deny" | "throw" },
}));
vi.mock("@/../../api/src/trpc/trpc", () => ({
	createContext: () => ({ prisma: {} }),
}));
vi.mock("@/../../api/src/lib/rate-limit", () => ({
	RATE_LIMITS: { cspReportIp: { scope: "csp", limit: 60, windowMs: 60_000 } },
	consumeRateLimit: async () => {
		if (limiter.mode === "throw") throw new Error("database unavailable");
		return {
			allowed: limiter.mode === "allow",
			count: 1,
			retryAfterSeconds: 0,
		};
	},
}));

const { POST } = await import("./route");

const report = (body: unknown) =>
	new Request("https://app.test/api/csp-report", {
		method: "POST",
		headers: { "content-type": "application/csp-report" },
		body: JSON.stringify(body),
	});

const SAMPLE = {
	"csp-report": {
		"document-uri":
			"https://app.test/reset-password?token=very-secret-token-value",
		"violated-directive": "script-src-elem",
		"blocked-uri": "inline",
	},
};

describe("POST /api/csp-report", () => {
	afterEach(() => {
		limiter.mode = "allow";
		vi.restoreAllMocks();
	});

	it("logs a redacted summary and answers 204", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const res = await POST(report(SAMPLE));
		expect(res.status).toBe(204);
		expect(warn).toHaveBeenCalledTimes(1);
		const logged = warn.mock.calls.flat().join(" ");
		expect(logged).toContain("script-src-elem");
		expect(logged).not.toContain("very-secret-token-value");
	});

	it("answers 204 and logs nothing when rate limited", async () => {
		limiter.mode = "deny";
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect((await POST(report(SAMPLE))).status).toBe(204);
		expect(warn).not.toHaveBeenCalled();
	});

	it("never fails when the database is unavailable", async () => {
		limiter.mode = "throw";
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect((await POST(report(SAMPLE))).status).toBe(204);
	});

	it("ignores oversized and non-JSON bodies", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const big = new Request("https://app.test/api/csp-report", {
			method: "POST",
			headers: { "content-length": String(64 * 1024) },
			body: "x".repeat(64 * 1024),
		});
		expect((await POST(big)).status).toBe(204);
		const junk = new Request("https://app.test/api/csp-report", {
			method: "POST",
			body: "not json",
		});
		expect((await POST(junk)).status).toBe(204);
		expect(warn).not.toHaveBeenCalled();
	});
});
