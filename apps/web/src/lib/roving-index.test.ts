import { describe, expect, it } from "vitest";
import { rovingIndex } from "./roving-index";

describe("rovingIndex", () => {
	it("moves forward and wraps at the end", () => {
		expect(rovingIndex("ArrowRight", 0, 4)).toBe(1);
		expect(rovingIndex("ArrowDown", 3, 4)).toBe(0);
	});

	it("moves back and wraps at the start", () => {
		expect(rovingIndex("ArrowLeft", 2, 4)).toBe(1);
		expect(rovingIndex("ArrowUp", 0, 4)).toBe(3);
	});

	it("jumps to the ends with Home and End", () => {
		expect(rovingIndex("Home", 2, 4)).toBe(0);
		expect(rovingIndex("End", 0, 4)).toBe(3);
	});

	it("ignores other keys and empty lists", () => {
		expect(rovingIndex("Enter", 1, 4)).toBeNull();
		expect(rovingIndex("ArrowDown", 0, 0)).toBeNull();
	});
});
