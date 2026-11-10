import { describe, expect, it } from "vitest";
import { qrPlaceholderPath } from "./qr-placeholder";

describe("qrPlaceholderPath", () => {
	it("is deterministic for a seed", () => {
		expect(qrPlaceholderPath(7)).toBe(qrPlaceholderPath(7));
	});

	it("differs between seeds", () => {
		expect(qrPlaceholderPath(7)).not.toBe(qrPlaceholderPath(21));
	});

	it("draws the three finder squares", () => {
		const d = qrPlaceholderPath(7);
		// Outer corners of the top-left, top-right and bottom-left finders.
		expect(d).toContain("M0 0h1v1h-1z");
		expect(d).toContain("M20 0h1v1h-1z");
		expect(d).toContain("M0 20h1v1h-1z");
		// The ring around each finder's centre is empty.
		expect(d).not.toContain("M1 1h1v1h-1z");
	});
});
