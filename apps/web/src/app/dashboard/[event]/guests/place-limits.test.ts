import assert from "node:assert/strict";
import { test } from "node:test";
import { fullNow, notAllowedPastLimits, pastLimit } from "./place-limits.ts";

/** A refusal as Prisma's driver adapter reports one. */
function refused(code: string, message: string) {
	return Object.assign(
		new Error(`Database error. Code: \`${code}\`. Message: \`${message}\``),
		{
			code: "P2039",
			meta: {
				driverAdapterError: {
					cause: { code, message, kind: "postgres" },
				},
			},
		},
	);
}

test("a full event or ticket is told apart from other errors", () => {
	assert.equal(pastLimit(refused("23514", "event full")), "event");
	assert.equal(pastLimit(refused("23514", "ticket full")), "ticket");
	// Another check constraint, or the same words under another code.
	assert.equal(pastLimit(refused("23514", "registrations_status")), null);
	assert.equal(pastLimit(refused("P0001", "event full")), null);
	assert.equal(pastLimit(new Error("boom")), null);
	assert.equal(pastLimit("event full"), null);
});

test("without the adapter's details, the message still says which", () => {
	assert.equal(
		pastLimit(
			new Error("Raw query failed. Code: `23514`. Message: `ticket full`"),
		),
		"ticket",
	);
	assert.equal(pastLimit(new Error("an event full of people")), null);
});

test("plain words for each", () => {
	assert.equal(fullNow("event"), "The event filled up just now.");
	assert.equal(fullNow("ticket"), "This ticket filled up just now.");
	assert.equal(
		notAllowedPastLimits(
			new Error(
				"Raw query failed. Code: `42501`. Message: `not allowed past limits`",
			),
		),
		true,
	);
	assert.equal(notAllowedPastLimits(new Error("permission denied")), false);
});
