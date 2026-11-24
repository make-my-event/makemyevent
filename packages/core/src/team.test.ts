import assert from "node:assert/strict";
import { test } from "node:test";
import {
	addMemberInput,
	editMemberInput,
	managesEvent,
	managesTeam,
} from "./team.ts";

test("add member: trims, lowercases the email, checks the role", () => {
	const ok = addMemberInput.safeParse({
		name: "  Aishwarya Shenoy ",
		email: " Aishwarya@Gmail.com ",
		role: "organizer",
	});
	assert.ok(ok.success);
	assert.deepEqual(ok.data, {
		name: "Aishwarya Shenoy",
		email: "aishwarya@gmail.com",
		role: "organizer",
	});

	assert.equal(
		addMemberInput.safeParse({
			name: "A",
			email: "not-an-email",
			role: "admin",
		}).success,
		false,
	);
	// Owner is the host's alone; it cannot be given.
	assert.equal(
		addMemberInput.safeParse({ name: "A", email: "a@x.org", role: "owner" })
			.success,
		false,
	);
	assert.equal(
		addMemberInput.safeParse({ name: "   ", email: "a@x.org", role: "admin" })
			.success,
		false,
	);
});

test("edit member: name and role only", () => {
	const ok = editMemberInput.safeParse({ name: "Amal", role: "volunteer" });
	assert.ok(ok.success);
	assert.equal(
		editMemberInput.safeParse({ name: "a".repeat(101), role: "admin" }).success,
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
