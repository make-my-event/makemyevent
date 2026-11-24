import assert from "node:assert/strict";
import { test } from "node:test";
import { type GlanceInput, glanceOf, placesLimit } from "./glance-data.ts";
import { daysUntil, eventPhase } from "../event-phase.ts";

const NOW = new Date("2026-11-21T10:00:00Z");

function input(overrides: Partial<GlanceInput> = {}): GlanceInput {
	return {
		published: true,
		startsAt: new Date("2026-12-01T09:00:00Z"),
		endsAt: new Date("2026-12-01T17:00:00Z"),
		timeZone: "Asia/Kolkata",
		capacity: null,
		ticketTypes: [{ id: "general", name: "General Pass", capacity: null }],
		registered: new Map(),
		lastRegisteredAt: null,
		...overrides,
	};
}

test("a fresh draft: nothing registered, no limit, an empty bar", () => {
	const glance = glanceOf(
		input({ published: false, startsAt: null, endsAt: null }),
		NOW,
	);
	assert.equal(glance.phase, "draft");
	assert.equal(glance.registered, 0);
	assert.equal(glance.limit, null);
	assert.equal(glance.percentFilled, null);
	assert.equal(glance.remaining, null);
	assert.equal(glance.fill, "open");
	assert.deepEqual(glance.segments, []);
	assert.deepEqual(
		glance.types.map((t) => [t.name, t.registered]),
		[["General Pass", 0]],
	);
});

test("the mockup: 12 students and 11 professionals of 500", () => {
	const glance = glanceOf(
		input({
			capacity: 500n,
			ticketTypes: [
				{ id: "s", name: "Students", capacity: null },
				{ id: "p", name: "Professionals", capacity: null },
			],
			registered: new Map([
				["s", 12],
				["p", 11],
			]),
		}),
		NOW,
	);
	assert.equal(glance.registered, 23);
	assert.equal(glance.limit, 500);
	assert.equal(glance.percentFilled?.toFixed(1), "4.6");
	assert.equal(glance.remaining, 477);
	assert.deepEqual(
		glance.segments.map((s) => [s.tone, s.registered, s.share.toFixed(2)]),
		[
			[1, 12, "2.40"],
			[2, 11, "2.20"],
		],
	);
});

test("the five biggest get the five colours; the legend follows the bar", () => {
	const counts = { a: 1, b: 9, c: 4, d: 2, e: 6, f: 3, g: 5 };
	const glance = glanceOf(
		input({
			ticketTypes: Object.keys(counts).map((id) => ({
				id,
				name: id.toUpperCase(),
				capacity: null,
			})),
			registered: new Map(Object.entries(counts)),
		}),
		NOW,
	);
	assert.deepEqual(
		glance.types.map((t) => [t.name, t.tone]),
		[
			["B", 1],
			["E", 2],
			["G", 3],
			["C", 4],
			["F", 5],
			["D", "rest"],
			["A", "rest"],
		],
	);
	// No limit: the bar is the split between tickets, end to end, in order.
	assert.deepEqual(
		glance.segments.map((s) => [s.tone, s.registered]),
		[
			[1, 9],
			[2, 6],
			[3, 5],
			[4, 4],
			[5, 3],
			["rest", 3],
		],
	);
	const total = glance.segments.reduce((sum, s) => sum + s.share, 0);
	assert.ok(Math.abs(total - 100) < 1e-9);
});

test("ties keep the host's order", () => {
	const glance = glanceOf(
		input({
			ticketTypes: [
				{ id: "x", name: "X", capacity: null },
				{ id: "y", name: "Y", capacity: null },
			],
		}),
		NOW,
	);
	assert.deepEqual(
		glance.types.map((t) => t.tone),
		[1, 2],
	);
});

test("almost full at 90%, sold out at the limit", () => {
	const at = (n: number) =>
		glanceOf(
			input({ capacity: 100n, registered: new Map([["general", n]]) }),
			NOW,
		).fill;
	assert.equal(at(89), "open");
	assert.equal(at(90), "almost-full");
	assert.equal(at(100), "sold-out");
});

test("places: the lower of the event's limit and every ticket's", () => {
	assert.equal(placesLimit(null, []), null);
	assert.equal(placesLimit(null, [null]), null);
	assert.equal(placesLimit(null, [100n, 50n]), 150);
	assert.equal(placesLimit(null, [100n, null]), null);
	assert.equal(placesLimit(120n, [100n, 50n]), 120);
	assert.equal(placesLimit(500n, [100n, 50n]), 150);
	assert.equal(placesLimit(500n, [100n, null]), 500);
});

test("phase: upcoming, today in the event's own zone, then completed", () => {
	const event = {
		published: true,
		timeZone: "Asia/Kolkata",
		// 21 Nov, 20:00 to 23:00 in Kolkata.
		startsAt: new Date("2026-11-21T14:30:00Z"),
		endsAt: new Date("2026-11-21T17:30:00Z"),
	};
	assert.equal(eventPhase(event, new Date("2026-11-20T10:00:00Z")), "upcoming");
	assert.equal(eventPhase(event, NOW), "today");
	assert.equal(eventPhase(event, new Date("2026-11-21T15:00:00Z")), "today");
	assert.equal(
		eventPhase(event, new Date("2026-11-21T18:00:00Z")),
		"completed",
	);
	assert.equal(eventPhase({ ...event, published: false }, NOW), "draft");
});

test("days until: counted on the event's own calendar", () => {
	const kolkata = "Asia/Kolkata";
	// 21 Nov 15:30 in Kolkata; the event starts 22 Nov 00:30 there.
	const now = new Date("2026-11-21T10:00:00Z");
	assert.equal(daysUntil(new Date("2026-11-21T19:00:00Z"), kolkata, now), 1);
	assert.equal(daysUntil(new Date("2026-11-21T14:00:00Z"), kolkata, now), 0);
	assert.equal(daysUntil(new Date("2026-11-18T10:00:00Z"), kolkata, now), -3);
	assert.equal(daysUntil(null, kolkata, now), null);
});

test("more registered than places fills the bar and never overruns it", () => {
	const glance = glanceOf(
		input({
			capacity: 10n,
			ticketTypes: [
				{ id: "a", name: "A", capacity: null },
				{ id: "b", name: "B", capacity: null },
			],
			registered: new Map([
				["a", 8],
				["b", 7],
			]),
		}),
		NOW,
	);
	assert.equal(glance.fill, "sold-out");
	assert.equal(glance.remaining, 0);
	const total = glance.segments.reduce((sum, s) => sum + s.share, 0);
	assert.ok(Math.abs(total - 100) < 1e-9, `segments add to ${total}`);
});

test("one ticket: the bar splits by the form's choice question instead", () => {
	const split = {
		label: "Profession",
		answers: [
			{ id: "student", name: "Student", registered: 3 },
			{ id: "working", name: "Working professional", registered: 5 },
			{ id: "unused", name: "Retired", registered: 0 },
			{ id: "", name: "No answer", registered: 1 },
		],
	};
	const glance = glanceOf(
		input({ capacity: 250n, registered: new Map([["general", 9]]), split }),
		NOW,
	);
	assert.equal(glance.splitBy, "Profession");
	// Biggest first; an answer nobody gave is left out.
	assert.deepEqual(
		glance.groups.map((g) => [g.name, g.registered, g.tone]),
		[
			["Working professional", 5, 1],
			["Student", 3, 2],
			["No answer", 1, 3],
		],
	);
	assert.equal(
		glance.segments.reduce((sum, s) => sum + s.registered, 0),
		9,
	);
	// The tickets are still there for whoever colours by ticket.
	assert.deepEqual(
		glance.types.map((t) => t.name),
		["General Pass"],
	);

	// Two tickets: the tickets say something, so they stay.
	const two = glanceOf(
		input({
			ticketTypes: [
				{ id: "a", name: "A", capacity: null },
				{ id: "b", name: "B", capacity: null },
			],
			registered: new Map([["a", 2]]),
			split,
		}),
		NOW,
	);
	assert.equal(two.splitBy, null);
	assert.deepEqual(
		two.groups.map((g) => g.name),
		["A", "B"],
	);

	// Nobody yet: nothing to split, the ticket stays.
	const none = glanceOf(input({ split }), NOW);
	assert.equal(none.splitBy, null);
	assert.deepEqual(
		none.groups.map((g) => g.name),
		["General Pass"],
	);
});
