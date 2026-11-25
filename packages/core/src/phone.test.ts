import assert from "node:assert/strict";
import { test } from "node:test";
import {
	COUNTRIES,
	countryOf,
	countryOfNumber,
	joinPhone,
	phoneDigits,
	splitPhone,
} from "./phone.ts";

test("an Indian number needs no country code", () => {
	for (const raw of [
		"98765 43210",
		"9876543210",
		"098765-43210",
		"919876543210",
		"+91 98765 43210",
		"+91 098765 43210",
		"0091 98765 43210",
		"tel:+919876543210",
	])
		assert.equal(phoneDigits(raw), "+919876543210", raw);
	// A landline, with its 0 or its code.
	assert.equal(phoneDigits("022 2345 6789"), "+912223456789");
	assert.equal(phoneDigits("+91 22 2345 6789"), "+912223456789");
});

test("what could be from anywhere is not guessed at", () => {
	for (const raw of [
		"4155552671", // a US number without its code
		"12345",
		"987654321", // a digit short
		"98765432101", // a digit over
		"+91 98765 4321",
		"+91 98765 432101",
		"+91",
		"9.87654E+09",
		"+0 98765 43210",
		"call me",
		"",
	])
		assert.equal(phoneDigits(raw), null, raw);
	assert.equal(phoneDigits("+1 (415) 555-2671"), "+14155552671");
	assert.equal(phoneDigits("+44 20 7946 0958"), "+442079460958");
});

test("countries are well formed and once each", () => {
	assert.ok(COUNTRIES.length > 210);
	assert.equal(new Set(COUNTRIES.map((c) => c.iso)).size, COUNTRIES.length);
	for (const c of COUNTRIES) {
		assert.match(c.iso, /^[A-Z]{2}$/);
		assert.match(c.dial, /^[1-9][0-9]{0,3}$/);
		assert.ok(c.name);
	}
	// No code is the start of another, but for +1's and +7's shared ones.
	for (const a of COUNTRIES)
		for (const b of COUNTRIES)
			if (a.dial !== b.dial && b.dial.startsWith(a.dial))
				assert.equal(a.dial, "1", `${a.name} and ${b.name}`);
});

test("a number finds its country", () => {
	assert.equal(countryOfNumber("+91 98765")?.iso, "IN");
	assert.equal(countryOfNumber("+1 415 555 2671")?.iso, "US");
	assert.equal(countryOfNumber("+1 415 555 2671", "CA")?.iso, "CA");
	assert.equal(countryOfNumber("+1 876 555 2671", "CA")?.iso, "JM");
	assert.equal(countryOfNumber("+7 700 000 0000", "KZ")?.iso, "KZ");
	assert.equal(countryOfNumber("98765"), null);
	assert.equal(countryOf("??").iso, "IN");
});

test("the picker and the box join and split again", () => {
	assert.equal(joinPhone("IN", "98765 43210"), "+91 98765 43210");
	assert.equal(joinPhone("IN", "098765 43210"), "+91 98765 43210");
	assert.equal(joinPhone("GB", "020 7946 0958"), "+44 20 7946 0958");
	// Italy keeps its 0.
	assert.equal(joinPhone("IT", "06 1234567"), "+39 06 1234567");
	assert.equal(joinPhone("IN", "  "), "");
	// A whole number pasted in brings its own country.
	assert.equal(joinPhone("IN", "+44 20 7946 0958"), "+44 20 7946 0958");
	assert.equal(joinPhone("IN", "0044 20 7946 0958"), "+44 20 7946 0958");
	assert.deepEqual(splitPhone("+919876543210"), {
		iso: "IN",
		typed: "9876543210",
	});
	assert.deepEqual(splitPhone("+44 20 7946 0958"), {
		iso: "GB",
		typed: "20 7946 0958",
	});
	assert.deepEqual(splitPhone("", "FR"), { iso: "FR", typed: "" });
	for (const typed of ["9", "98765", "98765 ", "98765 4", "98765 43210"])
		assert.equal(splitPhone(joinPhone("IN", typed)).typed, typed);
	for (const { iso } of COUNTRIES)
		assert.equal(splitPhone(joinPhone(iso, "612345678"), iso).iso, iso, iso);
});
