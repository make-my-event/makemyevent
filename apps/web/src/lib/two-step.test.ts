import assert from "node:assert/strict";
import { test } from "node:test";
import {
	newRecoveryCodes,
	readRecoveryCode,
	recoveryDigest,
} from "./recovery-codes.ts";
import { assuranceOf, isFresh, nextStep, readCode } from "./two-step.ts";

const token = (claims: object) =>
	`h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const on = [{ factor_type: "totp", status: "verified" }];
const now = new Date("2026-11-25T12:00:00Z");
const minutesAgo = (n: number) => Math.floor(now.getTime() / 1000) - n * 60;

test("aal2 takes the token's word and an authenticator still on the account", () => {
	const aal2 = token({
		aal: "aal2",
		amr: [
			{ method: "totp", timestamp: minutesAgo(3) },
			{ method: "otp", timestamp: minutesAgo(1) },
		],
	});
	assert.deepEqual(assuranceOf(aal2, on), {
		aal: "aal2",
		hasAuthenticator: true,
		codeGivenAt: new Date(minutesAgo(3) * 1000),
	});
	// Removed on another device: the token still says aal2, and is not believed.
	for (const factors of [
		undefined,
		[],
		[{ factor_type: "totp", status: "unverified" }],
		[{ factor_type: "phone", status: "verified" }],
	])
		assert.deepEqual(assuranceOf(aal2, factors), {
			aal: "aal1",
			hasAuthenticator: false,
			codeGivenAt: null,
		});
});

test("anything but a clear aal2 is aal1", () => {
	for (const bad of [
		token({ aal: "aal1" }),
		token({}),
		token({ aal: "AAL2" }),
		token({ aal: ["aal2"] }),
		"",
		"not a token",
		"a.%%%.c",
		`h.${Buffer.from("null").toString("base64url")}.s`,
	])
		assert.equal(assuranceOf(bad, on).aal, "aal1");
});

test("who is asked for what", () => {
	const none = { aal: "aal1", hasAuthenticator: false } as const;
	const waiting = { aal: "aal1", hasAuthenticator: true } as const;
	const passed = { aal: "aal2", hasAuthenticator: true } as const;

	// Runs events, no authenticator: set one up before any team page.
	assert.equal(nextStep(none, "team", true), "set_up");
	// A volunteer, an attendee or a private draft's owner goes on; bringing
	// someone in stops anyone.
	assert.equal(nextStep(none, "team", false), "go");
	assert.equal(nextStep(none, "self", true), "go");
	assert.equal(nextStep(none, "people", false), "set_up");
	// Has one and has not used it in this session: always asked.
	for (const need of ["self", "team", "people"] as const) {
		assert.equal(nextStep(waiting, need, false), "enter_code");
		assert.equal(nextStep(waiting, need, true), "enter_code");
		assert.equal(nextStep(passed, need, true), "go");
	}
	// aal2 without an authenticator cannot be, and is not let through.
	assert.equal(
		nextStep({ aal: "aal2", hasAuthenticator: false }, "team", true),
		"set_up",
	);
});

test("a code stands for ten minutes of changes, and only at aal2", () => {
	const at = (n: number) => new Date(minutesAgo(n) * 1000);
	assert.equal(isFresh({ aal: "aal2", codeGivenAt: at(9) }, now), true);
	assert.equal(isFresh({ aal: "aal2", codeGivenAt: at(10) }, now), false);
	assert.equal(isFresh({ aal: "aal2", codeGivenAt: null }, now), false);
	assert.equal(isFresh({ aal: "aal1", codeGivenAt: at(1) }, now), false);
});

test("a code is six digits, however it was typed", () => {
	assert.equal(readCode(" 123 456 "), "123456");
	assert.equal(readCode("123-456"), "123456");
	for (const bad of ["12345", "1234567", "12345a", "", null, 123456, "١٢٣٤٥٦"])
		assert.equal(readCode(bad), null);
});

test("recovery codes are ten, different, and read back however typed", () => {
	const codes = newRecoveryCodes();
	assert.equal(codes.length, 10);
	assert.equal(new Set(codes).size, 10);
	for (const code of codes) {
		assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/);
		const plain = code.replaceAll("-", "");
		assert.equal(readRecoveryCode(code), plain);
		assert.equal(readRecoveryCode(` ${code.toLowerCase()} `), plain);
		assert.equal(readRecoveryCode(code.replaceAll("-", " ")), plain);
		assert.equal(recoveryDigest(code), recoveryDigest(plain));
		assert.match(recoveryDigest(code), /^[0-9a-f]{64}$/);
	}
	assert.equal(readRecoveryCode("OOOO-IIII-LLLL-0000"), "0000111111110000");
	for (const bad of ["", "ABCD", "UUUU-UUUU-UUUU-UUUU", null, "A".repeat(65)])
		assert.equal(readRecoveryCode(bad), null);
});
