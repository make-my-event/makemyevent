import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTicket, type TicketInput, ticketStatus } from "./tickets.ts";

const form = (over: Partial<TicketInput> = {}): TicketInput => ({
	name: " General ",
	description: "",
	capped: false,
	capacity: "",
	limitPerPerson: false,
	maxPerPerson: "",
	inviteOnly: false,
	multiDay: true,
	days: [],
	transferable: false,
	waitlist: false,
	...over,
});
const days = ["2026-12-10", "2026-12-11", "2026-12-12"];
const context: {
	eventCapacity: number | null;
	eventDays: string[];
	sold: number;
} = { eventCapacity: 250, eventDays: days, sold: 0 };
const field = (input: TicketInput, c = context) => {
	const r = checkTicket(input, c);
	return r.ok ? "ok" : r.field;
};

test("a plain ticket shares the event's places", () => {
	const r = checkTicket(form(), context);
	assert.ok(r.ok);
	assert.equal(r.values.name, "General");
	assert.equal(r.values.capacity, null);
	assert.equal(r.values.maxPerPerson, null);
	assert.deepEqual(r.values.days, []);
});

test("a ticket's places fit inside the event's, and above those sold", () => {
	assert.equal(field(form({ capped: true, capacity: "250" })), "ok");
	assert.equal(field(form({ capped: true, capacity: "251" })), "capacity");
	assert.equal(field(form({ capped: true, capacity: "0" })), "capacity");
	assert.equal(field(form({ capped: true, capacity: "1.5" })), "capacity");
	assert.equal(
		field(form({ capped: true, capacity: "10" }), { ...context, sold: 11 }),
		"capacity",
	);
	// No event limit: any whole number.
	assert.equal(
		field(form({ capped: true, capacity: "5000" }), {
			...context,
			eventCapacity: null,
		}),
		"ok",
	);
	// Off: the number typed is ignored.
	assert.equal(field(form({ capped: false, capacity: "9999" })), "ok");
});

test("per person: within the ticket's places", () => {
	assert.equal(field(form({ limitPerPerson: true, maxPerPerson: "4" })), "ok");
	assert.equal(
		field(
			form({
				capped: true,
				capacity: "3",
				limitPerPerson: true,
				maxPerPerson: "4",
			}),
		),
		"maxPerPerson",
	);
	assert.equal(
		field(form({ limitPerPerson: true, maxPerPerson: "51" })),
		"maxPerPerson",
	);
	assert.equal(
		field(form({ limitPerPerson: true, maxPerPerson: "" })),
		"maxPerPerson",
	);
});

test("days: only the event's, and all of them is the same as none", () => {
	const some = checkTicket(
		form({ days: ["2026-12-11", "2026-12-11"] }),
		context,
	);
	assert.ok(some.ok && some.values.days.join() === "2026-12-11");
	const all = checkTicket(form({ days }), context);
	assert.ok(all.ok && all.values.days.length === 0);
	assert.equal(field(form({ days: ["2026-12-13"] })), "days");
	// One entry: days don't apply.
	const once = checkTicket(
		form({ multiDay: false, days: ["2026-12-11"] }),
		context,
	);
	assert.ok(once.ok && once.values.days.length === 0);
});

test("names and descriptions", () => {
	assert.equal(field(form({ name: "   " })), "name");
	assert.equal(field(form({ name: "x".repeat(81) })), "name");
	assert.equal(field(form({ description: "x".repeat(501) })), "description");
});

test("what a ticket shows", () => {
	const event = { capacity: 250, registered: 10 };
	assert.equal(
		ticketStatus({ closedAt: null, capacity: null, registered: 10 }, event),
		"on_sale",
	);
	assert.equal(
		ticketStatus({ closedAt: null, capacity: 10, registered: 10 }, event),
		"sold_out",
	);
	assert.equal(
		ticketStatus(
			{ closedAt: "2026-01-01", capacity: 10, registered: 10 },
			event,
		),
		"closed",
	);
	assert.equal(
		ticketStatus(
			{ closedAt: null, capacity: null, registered: 5 },
			{ capacity: 10, registered: 10 },
		),
		"sold_out",
	);
});
