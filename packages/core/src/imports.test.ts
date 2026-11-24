import assert from "node:assert/strict";
import { test } from "node:test";
import { type FormField, newField, startingForm } from "./form.ts";
import { readSubmission } from "./guests.ts";
import {
	csvCell,
	csvLine,
	parseCsv,
	readImport,
	sheetCsvUrl,
	templateHeader,
} from "./imports.ts";

test("CSV as spreadsheets write it", () => {
	assert.deepEqual(parseCsv("﻿Name,Email\r\nAsha,a@b.com\r\n"), [
		["Name", "Email"],
		["Asha", "a@b.com"],
	]);
	assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\n"multi\nline",,x'), [
		["a", "b, c", 'say "hi"'],
		["multi\nline", "", "x"],
	]);
	assert.deepEqual(parseCsv("a,b\n\n,\nc,d"), [
		["a", "b"],
		["c", "d"],
	]);
	assert.deepEqual(parseCsv("last,row"), [["last", "row"]]);
});

test("cells are safe to open in a spreadsheet", () => {
	assert.equal(csvCell("=HYPERLINK(evil)"), "'=HYPERLINK(evil)");
	assert.equal(csvCell("+91 98765 43210"), "+91 98765 43210");
	assert.equal(csvCell("-5"), "-5");
	assert.equal(csvCell("+SUM(A1)"), "'+SUM(A1)");
	assert.equal(csvCell("-2+3+cmd|' /C calc'!A0"), "'-2+3+cmd|' /C calc'!A0");
	assert.equal(csvCell("@SUM(1)"), "'@SUM(1)");
	assert.equal(csvCell("a,b"), '"a,b"');
	assert.equal(csvCell('say "hi"'), '"say ""hi"""');
	assert.equal(csvLine(["a", "b"]), "a,b\r\n");
});

test("columns find their questions; rows become answers", () => {
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
				{ id: "working", label: "Working professional" },
			],
			allowOther: true,
		},
	};
	const topics: FormField = {
		...newField("checkboxes"),
		label: "Topics",
		settings: {
			options: [
				{ id: "ai", label: "AI" },
				{ id: "web", label: "Web" },
			],
		},
	};
	const fields = [name, email, phone, profession, topics];
	assert.deepEqual(templateHeader(fields), [
		"Full name",
		"Email address",
		"Phone number",
		"Profession",
		"Topics",
	]);
	const sheet = readImport(
		fields,
		parseCsv(
			"Name,E-mail,Mobile,profession,Topics,Notes\n" +
				"Asha,Asha@X.com,+91 98765 43210,student,AI; web,vip\n" +
				"Ravi,ravi@x.com,,Researcher,AI,\n" +
				"Meera,meera@x.com,,WORKING PROFESSIONAL,Cooking,\n",
		),
	);
	assert.deepEqual(
		sheet.columns.map((c) => c.fieldId),
		[name.id, email.id, phone.id, profession.id, topics.id, null],
	);
	assert.deepEqual(sheet.missing, []);
	const [asha, ravi, meera] = sheet.rows;
	assert.equal(asha?.line, 2);
	assert.equal(asha?.input.answers[profession.id], "student");
	assert.deepEqual(asha?.input.answers[topics.id], ["ai", "web"]);
	// Not an option, but Other is allowed: written in.
	assert.equal(ravi?.input.answers[profession.id], "other");
	assert.equal(ravi?.input.other[profession.id], "Researcher");
	assert.equal(meera?.input.answers[profession.id], "working");
	// "Cooking" is no topic and Other isn't allowed: the row is refused.
	const check = (row: typeof asha) =>
		row ? readSubmission(fields, row.input, null, "2026-11-24") : null;
	assert.equal(check(asha)?.ok, true);
	assert.equal(check(ravi)?.ok, true);
	assert.equal(check(meera)?.ok, false);
	// A file without an email column can't import anyone.
	assert.deepEqual(readImport(fields, parseCsv("Name\nAsha")).missing, [
		"Email address",
		"Profession",
	]);
});

test("only Google Sheets links become a CSV address", () => {
	assert.equal(
		sheetCsvUrl(
			"https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=42",
		),
		"https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/export?format=csv&gid=42",
	);
	assert.equal(
		sheetCsvUrl(
			"https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
		),
		"https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/export?format=csv",
	);
	assert.equal(
		sheetCsvUrl(
			"https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345",
		),
		null,
	);
	assert.equal(
		sheetCsvUrl(
			"http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345",
		),
		null,
	);
	assert.equal(
		sheetCsvUrl(
			"https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345",
		),
		null,
	);
	assert.equal(sheetCsvUrl("not a link"), null);
});
