import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_REDIRECT, safeRedirectPath } from "./safe-redirect.ts";

test("keeps ordinary paths on this site", () => {
	assert.equal(safeRedirectPath("/events"), "/events");
	assert.equal(
		safeRedirectPath("/events/42?tab=tickets#top"),
		"/events/42?tab=tickets#top",
	);
});

test("falls back when nothing is given", () => {
	assert.equal(safeRedirectPath(null), DEFAULT_REDIRECT);
	assert.equal(safeRedirectPath(undefined), DEFAULT_REDIRECT);
	assert.equal(safeRedirectPath(""), DEFAULT_REDIRECT);
});

test("never sends someone back into sign-in, its second step included", () => {
	for (const path of [
		"/signin",
		"/signin?next=/events",
		"/signin/verify",
		"/signin/setup?next=/dashboard",
		"/signin/recovery",
		"/auth/confirm",
		"/auth/callback?code=1",
		"/dashboard/../signin/verify",
	])
		assert.equal(safeRedirectPath(path), DEFAULT_REDIRECT, path);
	assert.equal(safeRedirectPath("/signin-help"), "/signin-help");
	assert.equal(safeRedirectPath("/account/security"), "/account/security");
});

test("refuses other sites, however they are written", () => {
	for (const bad of [
		"https://evil.example",
		"http://evil.example/path",
		"//evil.example",
		"/\\evil.example",
		"/\\/evil.example",
		"javascript:alert(1)",
		"data:text/html,hi",
		"evil.example",
		" /events",
		"/events\n/evil",
		"/\t/evil.example",
	]) {
		assert.equal(
			safeRedirectPath(bad),
			DEFAULT_REDIRECT,
			`should refuse ${JSON.stringify(bad)}`,
		);
	}
});

test("never loops back into the sign-in flow", () => {
	assert.equal(safeRedirectPath("/signin"), DEFAULT_REDIRECT);
	assert.equal(safeRedirectPath("/signin?next=/events"), DEFAULT_REDIRECT);
	assert.equal(safeRedirectPath("/auth/callback"), DEFAULT_REDIRECT);
});

test("refuses absurdly long values", () => {
	assert.equal(safeRedirectPath(`/${"a".repeat(600)}`), DEFAULT_REDIRECT);
});
