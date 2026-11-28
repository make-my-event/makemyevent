import assert from "node:assert/strict";
import { test } from "node:test";
import { contactInput } from "./contact.ts";

const valid = {
	name: " Priya ",
	email: " Priya@Example.COM ",
	topic: "refund",
	message: "  My refund has not arrived yet.  ",
};

test("contact: trims, lowercases the email", () => {
	const ok = contactInput.safeParse(valid);
	assert.ok(ok.success);
	assert.deepEqual(ok.data, {
		name: "Priya",
		email: "priya@example.com",
		topic: "refund",
		message: "My refund has not arrived yet.",
	});
});

test("contact: refuses what is missing, too short, too long or unknown", () => {
	const fails = (patch: Record<string, unknown>) =>
		assert.equal(contactInput.safeParse({ ...valid, ...patch }).success, false);
	fails({ name: "   " });
	fails({ email: "not-an-email" });
	fails({ topic: "sales" });
	fails({ message: "hi" });
	fails({ message: "x".repeat(5001) });
	fails({ name: "x".repeat(121) });
});
