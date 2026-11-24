import assert from "node:assert/strict";
import { test } from "node:test";
import { type FormField, newField, startingForm } from "./form.ts";
import {
	answerText,
	normalizeContact,
	normalizeTicketCode,
	readSubmission,
	splitContacts,
	decodeCursor,
	encodeCursor,
	guestInitials,
	guestQueryString,
	readGuestQuery,
	ticketCodeSearch,
} from "./guests.ts";

const ID = "6f1c3a2e-9b7d-4c1a-8e2f-0a1b2c3d4e5f";

test("the list's address is read safely, and written back without defaults", () => {
	assert.deepEqual(readGuestQuery({}), {
		q: "",
		ticket: null,
		checked: "all",
		source: "all",
		cancelled: false,
		after: null,
	});
	const query = readGuestQuery({
		q: "  aarav  ",
		ticket: ID.toUpperCase(),
		checked: "in",
		source: "invite",
	});
	assert.equal(query.q, "aarav");
	assert.equal(query.ticket, ID);
	assert.equal(query.checked, "in");
	assert.equal(query.source, "invite");
	// Anything unexpected falls back.
	const odd = readGuestQuery({
		q: ["x", "y"],
		ticket: "1; drop table",
		checked: "maybe",
		source: "everyone",
		after: "nope",
	});
	assert.equal(odd.q, "x");
	assert.equal(odd.ticket, null);
	assert.equal(odd.checked, "all");
	assert.equal(odd.source, "all");
	assert.equal(odd.after, null);
	assert.equal(readGuestQuery({ q: "a".repeat(500) }).q.length, 100);
	assert.equal(guestQueryString({ q: "a b", checked: "all" }), "?q=a+b");
	assert.equal(guestQueryString({}), "");
	assert.equal(readGuestQuery({ cancelled: "1" }).cancelled, true);
	assert.equal(readGuestQuery({ cancelled: "yes" }).cancelled, false);
	assert.equal(guestQueryString({ cancelled: true }), "?cancelled=1");
});

test("a page cursor round-trips, and a forged one is refused", () => {
	const cursor = { at: new Date("2026-11-23T10:15:00.123Z"), id: ID };
	assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
	assert.equal(decodeCursor(`2026-11-23_${ID}`), null);
	assert.equal(decodeCursor(`2026-11-23T10:15:00.123Z_not-an-id`), null);
	assert.equal(decodeCursor(`2026-13-45T99:99:99.999Z_${ID}`), null);
	assert.equal(decodeCursor(""), null);
});

test("a ticket code is found however it is typed", () => {
	assert.equal(ticketCodeSearch("mme7q4k2291"), "MME-7Q4K-2291");
	assert.equal(ticketCodeSearch("MME-7Q4K-2291"), "MME-7Q4K-2291");
	assert.equal(ticketCodeSearch("mme 7q4k 2291"), "MME-7Q4K-2291");
	assert.equal(ticketCodeSearch("VIP-001"), "VIP-001");
	assert.equal(ticketCodeSearch("aarav@cet.ac.in"), null);
	assert.equal(ticketCodeSearch("ab"), null);
});

test("initials from any name", () => {
	assert.equal(guestInitials("Aarav Nair"), "AN");
	assert.equal(guestInitials("ananya"), "A");
	assert.equal(guestInitials("  Mary  Jane  Watson "), "MW");
	assert.equal(guestInitials("Ölaf Ömer"), "ÖÖ");
	assert.equal(guestInitials("— ."), "?");
});

test("answers read as words", () => {
	const select = {
		...newField("select"),
		settings: {
			options: [
				{ id: "student", label: "Student" },
				{ id: "working", label: "Working" },
			],
			allowOther: true,
		},
	};
	assert.equal(answerText(select, "student"), "Student");
	assert.equal(answerText(select, "gone"), "(a removed option)");
	assert.equal(answerText(select, "other", "Researcher"), "Other: Researcher");
	assert.equal(
		answerText({ ...select, kind: "checkboxes" }, ["student", "working"]),
		"Student, Working",
	);
	assert.equal(answerText(newField("yes_no"), "yes"), "Yes");
	assert.equal(answerText(newField("consent"), true), "Agreed");
	assert.equal(answerText(newField("short_text"), "  CET "), "CET");
	assert.equal(answerText(newField("heading"), "x"), "");
	assert.equal(answerText(newField("short_text"), undefined), "");
});

test("blocklist entries are stored one way", () => {
	assert.deepEqual(normalizeContact("email", " A@B.com "), {
		ok: true,
		value: "a@b.com",
	});
	assert.deepEqual(normalizeContact("email", "mailto:x@y.in"), {
		ok: true,
		value: "x@y.in",
	});
	assert.equal(normalizeContact("email", "nope").ok, false);
	assert.deepEqual(normalizeContact("phone", "+91 98765-43210"), {
		ok: true,
		value: "+919876543210",
	});
	assert.equal(normalizeContact("phone", "98765 43210").ok, false);
	assert.deepEqual(splitContacts("a@b.com, c@d.com\n\na@b.com;e@f.com"), [
		"a@b.com",
		"c@d.com",
		"e@f.com",
	]);
});

test("custom ticket codes", () => {
	assert.deepEqual(normalizeTicketCode(" vip-001 "), {
		ok: true,
		code: "VIP-001",
	});
	assert.equal(normalizeTicketCode("ab").ok, false);
	assert.equal(normalizeTicketCode("-ABC").ok, false);
	assert.equal(normalizeTicketCode("has space").ok, false);
});

test("a submission is checked, then stored clean", () => {
	const [name, email, phone] = startingForm() as [
		FormField,
		FormField,
		FormField,
	];
	const profession: FormField = {
		...newField("select"),
		label: "Profession",
		required: true,
		settings: {
			options: [
				{ id: "student", label: "Student" },
				{ id: "working", label: "Working" },
			],
			allowOther: true,
		},
	};
	const college: FormField = {
		...newField("short_text"),
		label: "College",
		required: true,
		showIf: {
			match: "all",
			conditions: [{ source: profession.id, op: "is", value: "student" }],
		},
	};
	const fields = [name, email, phone, profession, college];
	const today = "2026-11-24";
	const send = (
		answers: Record<string, unknown>,
		other: Record<string, string> = {},
	) => readSubmission(fields, { answers, other }, null, today);

	const missing = send({ [name.id]: "Aarav" });
	assert.equal(missing.ok, false);
	if (!missing.ok)
		assert.ok(missing.problems[email.id] && missing.problems[profession.id]);

	// Working: college hidden, so neither required nor stored.
	const working = send({
		[name.id]: "  Aarav Nair ",
		[email.id]: "Aarav@CET.ac.in",
		[phone.id]: "+91 98765 43210",
		[profession.id]: "working",
		[college.id]: "CET",
	});
	assert.ok(working.ok);
	if (working.ok) {
		assert.equal(working.name, "Aarav Nair");
		assert.equal(working.email, "aarav@cet.ac.in");
		assert.deepEqual(
			working.rows.map((r) => [r.fieldId, r.value]),
			[
				[phone.id, "+919876543210"],
				[profession.id, "working"],
			],
		);
	}
	// A student must give a college.
	const student = send({
		[name.id]: "A",
		[email.id]: "a@b.com",
		[profession.id]: "student",
	});
	assert.equal(student.ok, false);
	// Other keeps its text; anything else drops it.
	const other = send(
		{ [name.id]: "A", [email.id]: "a@b.com", [profession.id]: "other" },
		{ [profession.id]: " Researcher " },
	);
	assert.ok(other.ok);
	if (other.ok) assert.equal(other.rows[0]?.otherText, "Researcher");
	const notOther = send(
		{ [name.id]: "A", [email.id]: "a@b.com", [profession.id]: "working" },
		{ [profession.id]: "stale" },
	);
	if (notOther.ok) assert.equal(notOther.rows[0]?.otherText, null);
	// Junk is ignored, not stored.
	assert.equal(readSubmission(fields, "nope", null, today).ok, false);
	const long = send({
		[name.id]: "x".repeat(130),
		[email.id]: "a@b.com",
		[profession.id]: "working",
	});
	assert.equal(long.ok, false);
});
