import { describe, expect, it } from "vitest";
import {
	formatEventStart,
	formatTicketPrice,
	getCardPriceLabel,
	getEventDateParts,
} from "./event-format";

describe("formatEventStart", () => {
	// 13:00 UTC on Sat 14 Nov 2026.
	const start = new Date("2026-11-14T13:00:00Z");

	it("shows the time in the event's own timezone, not the viewer's", () => {
		const kolkata = formatEventStart(start, "Asia/Kolkata");
		const london = formatEventStart(start, "Europe/London");

		expect(kolkata).toMatch(/14 Nov/);
		expect(kolkata).toMatch(/6:30/);
		expect(london).toMatch(/1:00/);
	});

	it("rolls the date over when the timezone puts the start on the next day", () => {
		const late = new Date("2026-11-14T20:00:00Z");

		expect(formatEventStart(late, "Asia/Kolkata")).toMatch(/15 Nov/);
	});

	it("falls back to Asia/Kolkata for an invalid timezone instead of throwing", () => {
		expect(formatEventStart(start, "Not/AZone")).toBe(
			formatEventStart(start, "Asia/Kolkata"),
		);
	});
});

describe("formatTicketPrice", () => {
	it("returns null when the event has no published tickets", () => {
		expect(formatTicketPrice({ cheapestPrice: null, tierCount: 0 })).toBeNull();
	});

	it("labels a zero-priced cheapest tier as Free", () => {
		expect(formatTicketPrice({ cheapestPrice: 0, tierCount: 3 })).toBe("Free");
	});

	it("shows a single paid tier as a plain rupee amount", () => {
		expect(formatTicketPrice({ cheapestPrice: 499, tierCount: 1 })).toBe(
			"₹499",
		);
	});

	it("prefixes From when several tiers exist", () => {
		expect(formatTicketPrice({ cheapestPrice: 499, tierCount: 2 })).toBe(
			"From ₹499",
		);
	});

	it("groups thousands the Indian way", () => {
		expect(formatTicketPrice({ cheapestPrice: 150000, tierCount: 1 })).toBe(
			"₹1,50,000",
		);
	});
});

describe("getCardPriceLabel", () => {
	it("uses the cheapest tier, not the first one", () => {
		expect(getCardPriceLabel([{ price: 900 }, { price: 499 }])).toBe(
			"From ₹499",
		);
	});

	it("labels the event Free when any tier is free", () => {
		expect(getCardPriceLabel([{ price: 900 }, { price: 0 }])).toBe("Free");
	});

	it("returns null instead of claiming Free when there are no tiers", () => {
		expect(getCardPriceLabel([])).toBeNull();
	});
});

describe("getEventDateParts", () => {
	it("splits the start into calendar pieces in the event's timezone", () => {
		// 20:00 UTC on Sat 14 Nov is already Sun 15 Nov in Kolkata.
		expect(
			getEventDateParts(new Date("2026-11-14T20:00:00Z"), "Asia/Kolkata"),
		).toEqual({ day: "15", month: "Nov", weekday: "Sun" });
	});
});
