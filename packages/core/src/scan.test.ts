import assert from "node:assert/strict";
import { test } from "node:test";
import {
	readTicketCode,
	repeatGuard,
	SCAN_OUTCOMES,
	SCAN_WORDS,
	scanKind,
} from "./scan.ts";

test("every answer has words, and one of three kinds", () => {
	for (const outcome of SCAN_OUTCOMES) {
		assert.ok(SCAN_WORDS[outcome].title, outcome);
		if (scanKind(outcome) === "stop")
			assert.ok(SCAN_WORDS[outcome].detail, outcome);
	}
	assert.equal(scanKind("admitted"), "admit");
	assert.equal(scanKind("already_in"), "again");
	assert.equal(scanKind("cancelled"), "stop");
	assert.equal(scanKind("unknown"), "stop");
});

test("a typed ticket code reads however it was typed", () => {
	assert.equal(readTicketCode("MME-PNZA-ZDRE"), "MME-PNZA-ZDRE");
	assert.equal(readTicketCode("mme pnza zdre"), "MME-PNZA-ZDRE");
	assert.equal(readTicketCode("pnzazdre"), "MME-PNZA-ZDRE");
	// Letters people mistake for digits.
	assert.equal(readTicketCode("MME-7K2O-9F4B"), "MME-7K20-9F4B");
	assert.equal(readTicketCode("MME-7K2I-9F4B"), "MME-7K21-9F4B");
	assert.equal(readTicketCode("MME-7K2Q-9F4B"), "MME-7K2Q-9F4B");
	assert.equal(readTicketCode("MME-7K2Q-9F4"), null);
	assert.equal(readTicketCode("MME-7K2U-9F4B"), null);
	assert.equal(readTicketCode(""), null);
	assert.equal(readTicketCode("M1.abc"), null);
});

test("the same code is read once a while; another at once", () => {
	const fresh = repeatGuard(5000);
	assert.equal(fresh("A", 0), true);
	assert.equal(fresh("A", 1000), false);
	assert.equal(fresh("B", 1100), true);
	assert.equal(fresh("A", 1200), true);
	assert.equal(fresh("A", 6300), true);
});
