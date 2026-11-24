import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventInput, numberedSlug, slugFromTitle } from "./events.ts";

test("slugFromTitle makes a readable address", () => {
	assert.equal(slugFromTitle("Winter Build: 2026!"), "winter-build-2026");
	assert.equal(slugFromTitle("  Café   Night  "), "cafe-night");
	assert.equal(slugFromTitle("ನಮಸ್ಕಾರ"), "event");
	assert.equal(slugFromTitle("Organized"), "organized-event");
	assert.ok(slugFromTitle("a".repeat(200)).length <= 60);
	assert.match(
		slugFromTitle(`${"ab-".repeat(40)}x`),
		/^[a-z0-9]+(-[a-z0-9]+)*$/,
	);
});

test("numberedSlug counts up and stays within length", () => {
	assert.equal(numberedSlug("carnival", 1), "carnival");
	assert.equal(numberedSlug("carnival", 2), "carnival-2");
	const long = numberedSlug("a".repeat(60), 12);
	assert.equal(long.length, 60);
	assert.ok(long.endsWith("-12"));
});

test("createEventInput trims and checks the title", () => {
	assert.equal(
		createEventInput.parse({ title: "  Fest ", host: "me" }).title,
		"Fest",
	);
	assert.equal(
		createEventInput.safeParse({ title: "   ", host: "me" }).success,
		false,
	);
	assert.equal(
		createEventInput.safeParse({ title: "x".repeat(121), host: "me" }).success,
		false,
	);
	assert.equal(
		createEventInput.safeParse({ title: "Fest", host: "org" }).success,
		false,
	);
});

test("event page: address shape, reserved words, capacity", async () => {
	const { eventPageInput } = await import("./events.ts");
	const base = {
		inviteOnly: false,
		listed: true,
		registrationClosed: false,
		posterAlt: "",
	};
	const ok = eventPageInput.safeParse({
		...base,
		address: " Design-Summit-26 ",
		capacity: "250",
	});
	assert.ok(ok.success);
	assert.equal(ok.data.address, "design-summit-26");
	assert.equal(ok.data.capacity, 250);
	assert.equal(
		eventPageInput.safeParse({ ...base, address: "x", capacity: "" }).data
			?.capacity,
		null,
	);
	for (const address of [
		"organized",
		"two--hyphens",
		"-edge",
		"spaces here",
		"émoji",
	])
		assert.equal(
			eventPageInput.safeParse({ ...base, address, capacity: "1" }).success,
			false,
			address,
		);
	for (const capacity of ["0", "-5", "2.5", "abc", "1000001"])
		assert.equal(
			eventPageInput.safeParse({ ...base, address: "ok", capacity }).success,
			false,
			capacity,
		);
});
