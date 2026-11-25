import assert from "node:assert/strict";
import { test } from "node:test";
import { listTickets, ticketState } from "./ticket-state.ts";

const now = new Date("2026-11-26T12:00:00Z");
const ticket = (over: Record<string, unknown> = {}) => ({
	status: "confirmed",
	eventStatus: "published",
	startsAt: new Date("2026-12-01T09:00:00Z") as Date | null,
	endsAt: new Date("2026-12-01T17:00:00Z") as Date | null,
	eventTitle: "Carnival",
	ticketCode: "MME-7Q4K-2291",
	venueName: "Town Hall" as string | null,
	...over,
});

test("who has a pass", () => {
	assert.deepEqual(ticketState(ticket(), now), {
		label: null,
		hasPass: true,
		past: false,
	});
	// Invited before the event is published: still a pass.
	assert.equal(
		ticketState(ticket({ eventStatus: "draft" }), now).hasPass,
		true,
	);
	assert.equal(
		ticketState(ticket({ status: "waitlisted" }), now).hasPass,
		false,
	);
	assert.equal(
		ticketState(ticket({ status: "cancelled" }), now).hasPass,
		false,
	);
	assert.deepEqual(ticketState(ticket({ eventStatus: "cancelled" }), now), {
		label: "Event cancelled",
		hasPass: false,
		past: true,
	});
	const ended = ticketState(
		ticket({ endsAt: new Date("2026-11-26T11:00:00Z") }),
		now,
	);
	assert.deepEqual(ended, { label: "Ended", hasPass: true, past: true });
	assert.equal(ticketState(ticket({ endsAt: null }), now).past, false);
});

test("the order they are listed in", () => {
	const names = (query = "") =>
		listTickets(
			[
				ticket({ eventTitle: "Undated", startsAt: null, endsAt: null }),
				ticket({
					eventTitle: "Old",
					startsAt: new Date("2026-01-01T00:00:00Z"),
					endsAt: new Date("2026-01-02T00:00:00Z"),
				}),
				ticket({ eventTitle: "Later" }),
				ticket({
					eventTitle: "Sooner",
					startsAt: new Date("2026-11-27T00:00:00Z"),
					endsAt: new Date("2026-11-28T00:00:00Z"),
					ticketCode: "VIP-001",
					venueName: null,
				}),
				ticket({
					eventTitle: "Recent",
					startsAt: new Date("2026-10-01T00:00:00Z"),
					endsAt: new Date("2026-10-02T00:00:00Z"),
				}),
			],
			query,
			now,
		).map((t) => t.eventTitle);
	assert.deepEqual(names(), ["Sooner", "Later", "Undated", "Recent", "Old"]);
	assert.deepEqual(names("later"), ["Later"]);
	assert.deepEqual(names("vip001"), ["Sooner"]);
	assert.deepEqual(names("VIP-001"), ["Sooner"]);
	assert.deepEqual(names("-"), []);
	assert.equal(names("town").length, 4);
});
