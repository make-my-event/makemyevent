import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { readPass, readView, signPass, signView } from "./pass-token.ts";

const master = randomBytes(32);
const claims = {
	eventId: "3b90d3a6-cf21-4e8f-abb1-7547b8dc5914",
	registrationId: "cccccccc-0000-4000-8000-000000000033",
	version: 1,
};

test("a pass reads back as what was signed", () => {
	const token = signPass(master, claims);
	assert.match(token, /^M1\.[A-Za-z0-9_-]{66}$/);
	assert.deepEqual(readPass(master, token), claims);
});

test("anything altered, or signed elsewhere, is refused", () => {
	const token = signPass(master, claims);
	const flipped = `${token.slice(0, -2)}${token.at(-2) === "A" ? "B" : "A"}${token.at(-1)}`;
	assert.equal(readPass(master, flipped), null);
	assert.equal(readPass(randomBytes(32), token), null);
	// Another guest's id in the same token body: the MAC no longer fits.
	const raw = Buffer.from(token.slice(3), "base64url");
	raw[20] = (raw[20] ?? 0) ^ 1;
	assert.equal(readPass(master, `M1.${raw.toString("base64url")}`), null);
	assert.equal(readPass(master, "MME-7Q4K-2291"), null);
	assert.equal(readPass(master, `M1.${"A".repeat(66)}`), null);
	assert.equal(readPass(master, ""), null);
});

test("a new key version retires the old passes, for that event only", () => {
	const v1 = signPass(master, claims);
	const v2 = signPass(master, { ...claims, version: 2 });
	assert.notEqual(v1, v2);
	assert.equal(readPass(master, v2)?.version, 2);
	// The version is in the token; the scanner compares it to the event's.
	assert.equal(readPass(master, v1)?.version, 1);
	assert.throws(() => signPass(master, { ...claims, version: 0 }));
	assert.throws(() => signPass(master, { ...claims, eventId: "nope" }));
});

test("a view link and a pass are never each other", () => {
	const view = signView(master, claims);
	const pass = signPass(master, claims);
	assert.match(view, /^V1\.[A-Za-z0-9_-]{66}$/);
	assert.deepEqual(readView(master, view), claims);
	assert.equal(readPass(master, view), null);
	assert.equal(readView(master, pass), null);
	// The same body under the other prefix: the key differs, so the MAC fails.
	assert.equal(readPass(master, `M1.${view.slice(3)}`), null);
	assert.equal(readView(master, `V1.${pass.slice(3)}`), null);
	// A new version retires view links too.
	assert.equal(readView(master, view)?.version, 1);
	assert.notDeepEqual(
		readView(master, signView(master, { ...claims, version: 2 })),
		claims,
	);
});
