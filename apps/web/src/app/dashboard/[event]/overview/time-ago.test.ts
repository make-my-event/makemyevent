import assert from "node:assert/strict";
import { test } from "node:test";
import { timeAgo } from "./time-ago.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const ago = (ms: number) =>
	timeAgo(new Date(NOW.getTime() - ms), NOW, "Asia/Kolkata");

test("time ago, in the words a person would use", () => {
	assert.equal(ago(0), "Just now");
	assert.equal(ago(59_000), "Just now");
	assert.equal(ago(60_000), "1 min ago");
	assert.equal(ago(59 * 60_000), "59 min ago");
	assert.equal(ago(3 * 3_600_000), "3 h ago");
	assert.equal(ago(24 * 3_600_000), "yesterday");
	assert.equal(ago(4 * 86_400_000), "4 days ago");
	assert.equal(ago(40 * 86_400_000), "Oct 12, 2026");
});

test("a clock a little ahead never reads as the future", () => {
	assert.equal(timeAgo(new Date(NOW.getTime() + 5_000), NOW, null), "Just now");
});
