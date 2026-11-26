import assert from "node:assert/strict";
import { test } from "node:test";
import { addMemberInput, managesEvent, managesTeam } from "./team.ts";

test("add member: trims, lowercases the email, checks the role", () => {
	const ok = addMemberInput.safeParse({
		email: " Aishwarya@Gmail.com ",
		role: "organizer",
	});
	assert.ok(ok.success);
	assert.deepEqual(ok.data, {
		email: "aishwarya@gmail.com",
		role: "organizer",
	});

	assert.equal(
		addMemberInput.safeParse({
			email: "not-an-email",
			role: "admin",
		}).success,
		false,
	);
	// Owner is the host's alone; it cannot be given.
	assert.equal(
		addMemberInput.safeParse({ email: "a@x.org", role: "owner" }).success,
		false,
	);
});

test("what each role may do", () => {
	assert.deepEqual(
		(["owner", "admin", "organizer", "volunteer"] as const).map((role) => [
			managesTeam(role),
			managesEvent(role),
		]),
		[
			[true, true],
			[true, true],
			[false, true],
			[false, false],
		],
	);
});
