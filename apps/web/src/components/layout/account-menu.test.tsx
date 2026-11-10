import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signOut }));

import { AccountMenu } from "./account-menu";

const USER = { name: "Asha Kumar", email: "asha@example.com", image: null };

function renderMenu(): HTMLElement {
	render(<AccountMenu user={USER} dashboardHref="/dashboard" />);
	return screen.getByRole("button", { name: "Account menu for Asha Kumar" });
}

function itemNames(): string[] {
	return screen.getAllByRole("menuitem").map((item) => item.textContent ?? "");
}

afterEach(() => {
	cleanup();
	signOut.mockReset();
});

describe("AccountMenu", () => {
	it("shows the user's initials and starts closed", () => {
		const button = renderMenu();
		expect(button.textContent).toBe("AK");
		expect(button.getAttribute("aria-haspopup")).toBe("menu");
		expect(button.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("lists the account items, including My Tickets and Profile & Account", () => {
		fireEvent.click(renderMenu());
		expect(itemNames()).toEqual([
			"Dashboard",
			"My Tickets",
			"Profile & Account",
			"Browse events",
			"Sign out",
		]);
		expect(
			screen.getByRole("menuitem", { name: "My Tickets" }).getAttribute("href"),
		).toBe("/dashboard?tab=tickets");
		expect(
			screen
				.getByRole("menuitem", { name: "Profile & Account" })
				.getAttribute("href"),
		).toBe("/profile");
	});

	it("opens with ArrowDown on the first item and moves with arrows, Home and End", async () => {
		const button = renderMenu();
		await act(async () => {
			fireEvent.keyDown(button, { key: "ArrowDown" });
		});
		const items = screen.getAllByRole("menuitem");
		expect(button.getAttribute("aria-expanded")).toBe("true");
		expect(document.activeElement).toBe(items[0]);

		const menu = screen.getByRole("menu");
		fireEvent.keyDown(menu, { key: "ArrowDown" });
		expect(document.activeElement).toBe(items[1]);
		fireEvent.keyDown(menu, { key: "End" });
		expect(document.activeElement).toBe(items[items.length - 1]);
		fireEvent.keyDown(menu, { key: "ArrowDown" });
		expect(document.activeElement).toBe(items[0]);
		fireEvent.keyDown(menu, { key: "ArrowUp" });
		expect(document.activeElement).toBe(items[items.length - 1]);
		fireEvent.keyDown(menu, { key: "Home" });
		expect(document.activeElement).toBe(items[0]);
	});

	it("opens on the first item with Enter or Space (keyboard click)", async () => {
		const button = renderMenu();
		// Browsers turn Enter/Space on a button into a click with detail 0.
		await act(async () => {
			fireEvent.click(button, { detail: 0 });
		});
		expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
	});

	it("leaves focus on the avatar when opened with a pointer click", async () => {
		const button = renderMenu();
		button.focus();
		await act(async () => {
			fireEvent.click(button, { detail: 1 });
		});
		expect(screen.getByRole("menu")).toBeTruthy();
		expect(document.activeElement).toBe(button);
	});

	it("closes on Escape and returns focus to the avatar", async () => {
		const button = renderMenu();
		await act(async () => {
			fireEvent.keyDown(button, { key: "ArrowDown" });
		});
		fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
		expect(screen.queryByRole("menu")).toBeNull();
		expect(document.activeElement).toBe(button);
	});

	it("closes on Tab and on a click outside", () => {
		const button = renderMenu();
		fireEvent.click(button);
		fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
		expect(screen.queryByRole("menu")).toBeNull();

		fireEvent.click(button);
		fireEvent.pointerDown(document.body);
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("signs out back to the home page", () => {
		fireEvent.click(renderMenu());
		fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
		expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
	});
});
