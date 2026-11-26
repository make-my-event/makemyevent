import assert from "node:assert/strict";
import { test } from "node:test";
import { senderOf } from "./sender.ts";

test("the From line is taken in the shapes the email service accepts", () => {
	for (const [raw, from] of [
		["passes@makemyevent.org", "passes@makemyevent.org"],
		[
			"makemyevent <passes@makemyevent.org>",
			"makemyevent <passes@makemyevent.org>",
		],
		// As pasted from a .env file into a hosting dashboard.
		[
			'"makemyevent <passes@makemyevent.org>"',
			"makemyevent <passes@makemyevent.org>",
		],
		["'passes@makemyevent.org'", "passes@makemyevent.org"],
		[
			"  makemyevent<passes@makemyevent.org>  ",
			"makemyevent <passes@makemyevent.org>",
		],
	])
		assert.equal(senderOf(raw), from, raw);
	for (const raw of [
		undefined,
		"",
		"makemyevent",
		"passes@localhost",
		'"makemyevent <passes@makemyevent.org>',
		"make\nmyevent <passes@makemyevent.org>",
		"<passes@makemyevent.org>",
		'Say "hi" <passes@makemyevent.org>',
	])
		assert.equal(senderOf(raw), null, String(raw));
});
