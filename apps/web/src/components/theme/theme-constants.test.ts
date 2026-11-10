import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme-constants";

function mockSystemPrefersDark(prefersDark: boolean): void {
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			matches: prefersDark && query === "(prefers-color-scheme: dark)",
		})),
	);
}

function runInitScript(): void {
	// Evaluate the exact string the layout inlines into <head>.
	new Function(THEME_INIT_SCRIPT)();
}

describe("THEME_INIT_SCRIPT", () => {
	const root = document.documentElement;

	beforeEach(() => {
		localStorage.clear();
		root.className = "";
		root.removeAttribute("data-theme");
		mockSystemPrefersDark(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("applies a saved dark theme before hydration", () => {
		localStorage.setItem(THEME_STORAGE_KEY, "dark");
		runInitScript();

		expect(root.classList.contains("dark")).toBe(true);
		expect(root.getAttribute("data-theme")).toBe("dark");
	});

	it("uses the light default when nothing is saved, even if the OS is dark", () => {
		mockSystemPrefersDark(true);
		runInitScript();

		expect(root.classList.contains("dark")).toBe(false);
		expect(root.getAttribute("data-theme")).toBe("light");
	});

	it("follows the OS when the saved preference is system", () => {
		localStorage.setItem(THEME_STORAGE_KEY, "system");
		mockSystemPrefersDark(true);
		runInitScript();

		expect(root.classList.contains("dark")).toBe(true);
	});

	it("ignores a corrupted saved value", () => {
		localStorage.setItem(THEME_STORAGE_KEY, "purple");
		runInitScript();

		expect(root.getAttribute("data-theme")).toBe("light");
	});

	it("does not throw when storage is unavailable", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("SecurityError");
		});

		expect(runInitScript).not.toThrow();
		vi.restoreAllMocks();
	});
});
