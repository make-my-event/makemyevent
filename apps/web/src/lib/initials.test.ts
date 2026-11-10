import { describe, expect, it } from "vitest";
import { getInitials } from "./initials";

describe("getInitials", () => {
	it("uses the first letters of the first and last names", () => {
		expect(getInitials("Asha Kumar")).toBe("AK");
		expect(getInitials("asha devi kumar")).toBe("AK");
	});

	it("uses one letter for a single name", () => {
		expect(getInitials("Asha")).toBe("A");
	});

	it("ignores extra whitespace", () => {
		expect(getInitials("  Asha   Kumar  ")).toBe("AK");
	});

	it("falls back to the email, then to a placeholder", () => {
		expect(getInitials("", "asha@example.com")).toBe("A");
		expect(getInitials(null, null)).toBe("?");
	});
});
