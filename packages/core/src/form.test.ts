import assert from "node:assert/strict";
import { test } from "node:test";
import {
	answerProblem,
	answersProblems,
	canChangeKind,
	changeKind,
	checkForm,
	dependentsOf,
	duplicateField,
	FIELD_KINDS,
	FIELD_PRESETS,
	type FormField,
	formProblems,
	moveProblem,
	newField,
	readForm,
	removeField,
	startingForm,
	visibleFields,
} from "./form.ts";

const none = { tickets: [] };

/** Name, email, then a profession dropdown and a college shown for students. */
function sample() {
	const [name, email] = startingForm() as [FormField, FormField, FormField];
	const profession: FormField = {
		...newField("select"),
		label: "Profession",
		required: true,
		settings: {
			options: [
				{ id: "student", label: "Student" },
				{ id: "working", label: "Working" },
			],
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
	const year: FormField = {
		...newField("number"),
		label: "Year of study",
		showIf: {
			match: "all",
			conditions: [{ source: college.id, op: "filled" }],
		},
	};
	return {
		name,
		email,
		profession,
		college,
		year,
		fields: [name, email, profession, college, year],
	};
}

test("the starting form and every kind's new field are valid", () => {
	assert.deepEqual(formProblems(startingForm(), none), []);
	const fields = [
		...startingForm(),
		...FIELD_KINDS.map((kind) => newField(kind)),
	];
	assert.deepEqual(formProblems(fields, none), []);
	const presets = [...startingForm(), ...FIELD_PRESETS.map((p) => p.build())];
	assert.deepEqual(formProblems(presets, none), []);
});

test("name and email are always there, required, unconditional", () => {
	const { fields, name, email } = sample();
	assert.match(
		formProblems(
			fields.filter((f) => f !== name),
			none,
		)[0]?.message ?? "",
		/name/,
	);
	assert.ok(
		formProblems([{ ...name, required: false }, email], none).some((p) =>
			/always required/.test(p.message),
		),
	);
	assert.ok(
		formProblems([{ ...name, kind: "long_text" }, email], none).some(
			(p) => p.area === "kind",
		),
	);
	assert.ok(
		formProblems(
			[
				name,
				{
					...email,
					showIf: {
						match: "all",
						conditions: [{ source: name.id, op: "filled" }],
					},
				},
			],
			none,
		).some((p) => p.area === "showIf"),
	);
	assert.equal(canChangeKind(name, "long_text", false), false);
});

test("conditions only look up the form, and fit their question", () => {
	const { fields, profession, college } = sample();
	assert.deepEqual(formProblems(fields, none), []);
	// The college above the profession it depends on.
	const swapped = [
		fields[0],
		fields[1],
		college,
		profession,
		fields[4],
	] as FormField[];
	assert.match(
		formProblems(swapped, none)[0]?.message ?? "",
		/gone or now below/,
	);
	// An option that was removed.
	const cut = fields.map((f) =>
		f.id === profession.id
			? {
					...f,
					settings: {
						options: [
							{ id: "working", label: "Working" },
							{ id: "x", label: "X" },
						],
					},
				}
			: f,
	);
	assert.match(formProblems(cut, none)[0]?.message ?? "", /Choose an option/);
	// A test that doesn't fit: "contains" on a dropdown.
	const wrong = fields.map((f) =>
		f.id === college.id
			? {
					...f,
					showIf: {
						match: "all" as const,
						conditions: [
							{ source: profession.id, op: "contains" as const, value: "s" },
						],
					},
				}
			: f,
	);
	assert.match(formProblems(wrong, none)[0]?.message ?? "", /doesn't fit/);
	// A ticket rule needs real tickets.
	const ticketed = fields.map((f) =>
		f.id === college.id
			? {
					...f,
					showIf: {
						match: "all" as const,
						conditions: [
							{ source: "ticket", op: "any_of" as const, value: ["t1"] },
						],
					},
				}
			: f,
	);
	assert.deepEqual(
		formProblems(ticketed, { tickets: [{ id: "t1", name: "Student" }] }),
		[],
	);
	assert.match(
		formProblems(ticketed, none)[0]?.message ?? "",
		/no longer exists/,
	);
});

test("a hidden question hides what depends on it", () => {
	const { fields, profession, college, year } = sample();
	const student = visibleFields(
		fields,
		{ [profession.id]: "student", [college.id]: "CET" },
		null,
	);
	assert.ok(student.has(college.id) && student.has(year.id));
	// Working: college hidden, and year with it, though college still has text.
	const working = visibleFields(
		fields,
		{ [profession.id]: "working", [college.id]: "CET" },
		null,
	);
	assert.ok(!working.has(college.id) && !working.has(year.id));
	// Unanswered: "is" is false.
	assert.ok(!visibleFields(fields, {}, null).has(college.id));
});

test("all and any, numbers, dates, checkboxes, ticket", () => {
	const { fields, profession } = sample();
	const age = { ...newField("number"), label: "Age" };
	const day = { ...newField("date"), label: "Arrival" };
	const topics = {
		...newField("checkboxes"),
		label: "Topics",
		settings: {
			options: [
				{ id: "ai", label: "AI" },
				{ id: "web", label: "Web" },
			],
		},
	};
	const target: FormField = {
		...newField("short_text"),
		label: "Target",
		showIf: {
			match: "any",
			conditions: [
				{ source: age.id, op: "gte", value: 18 },
				{ source: day.id, op: "before", value: "2026-12-01" },
				{ source: topics.id, op: "includes", value: "ai" },
			],
		},
	};
	const form = [...fields, age, day, topics, target];
	assert.deepEqual(formProblems(form, none), []);
	const sees = (
		answers: Record<string, string | string[]>,
		ticket: string | null = null,
	) => visibleFields(form, answers, ticket).has(target.id);
	assert.equal(sees({}), false);
	assert.equal(sees({ [age.id]: "18" }), true);
	assert.equal(sees({ [age.id]: "17" }), false);
	assert.equal(sees({ [day.id]: "2026-11-30" }), true);
	assert.equal(sees({ [topics.id]: ["web"] }), false);
	assert.equal(sees({ [topics.id]: ["web", "ai"] }), true);
	const all = [
		...form.slice(0, -1),
		{
			...target,
			showIf: {
				match: "all" as const,
				conditions: target.showIf?.conditions ?? [],
			},
		},
	];
	assert.equal(
		visibleFields(
			all,
			{ [age.id]: "20", [day.id]: "2026-11-30", [topics.id]: ["ai"] },
			null,
		).has(target.id),
		true,
	);
	assert.equal(
		visibleFields(
			all,
			{ [age.id]: "20", [day.id]: "2026-12-30", [topics.id]: ["ai"] },
			null,
		).has(target.id),
		false,
	);
	// "is not" needs an answer; "doesn't include" holds for nothing ticked.
	const not: FormField = {
		...newField("short_text"),
		label: "Not",
		showIf: {
			match: "all",
			conditions: [{ source: profession.id, op: "is_not", value: "student" }],
		},
	};
	assert.equal(visibleFields([...fields, not], {}, null).has(not.id), false);
	assert.equal(
		visibleFields([...fields, not], { [profession.id]: "working" }, null).has(
			not.id,
		),
		true,
	);
	const ticketed: FormField = {
		...newField("short_text"),
		label: "Pass",
		showIf: {
			match: "all",
			conditions: [{ source: "ticket", op: "any_of", value: ["t1"] }],
		},
	};
	assert.equal(visibleFields([ticketed], {}, "t1").has(ticketed.id), true);
	assert.equal(visibleFields([ticketed], {}, "t2").has(ticketed.id), false);
});

test("moving keeps sources above and dependents below", () => {
	const { fields } = sample();
	// College (3) above Profession (2): refused.
	assert.match(
		moveProblem(fields, 3, 1) ?? "",
		/College depends on Profession/,
	);
	// Profession (2) below College (3): refused.
	assert.match(
		moveProblem(fields, 2, 4) ?? "",
		/College depends on Profession/,
	);
	// Name below email: fine.
	assert.equal(moveProblem(fields, 0, 1), null);
});

test("deleting a source drops the conditions on it", () => {
	const { fields, profession, college } = sample();
	assert.deepEqual(
		dependentsOf(fields, profession.id).map((f) => f.id),
		[college.id],
	);
	const left = removeField(fields, profession.id);
	assert.equal(left.find((f) => f.id === college.id)?.showIf, null);
	assert.deepEqual(formProblems(left, none), []);
});

test("duplicates get new ids; kind changes keep what still applies", () => {
	const { profession } = sample();
	const copy = duplicateField(profession);
	assert.notEqual(copy.id, profession.id);
	assert.notEqual(
		copy.settings.options?.[0]?.id,
		profession.settings.options?.[0]?.id,
	);
	assert.equal(copy.label, "Profession (copy)");
	const radio = changeKind(profession, "radio");
	assert.deepEqual(radio.settings.options, profession.settings.options);
	assert.equal(radio.placeholder, "");
	const heading = changeKind({ ...profession, required: true }, "heading");
	assert.equal(heading.required, false);
	assert.equal(heading.settings.options, undefined);
	// With answers: only between compatible kinds.
	assert.equal(canChangeKind(profession, "radio", true), true);
	assert.equal(canChangeKind(profession, "checkboxes", true), false);
	assert.equal(canChangeKind(profession, "checkboxes", false), true);
});

test("settings are checked and stray ones dropped", () => {
	const [name, email] = startingForm() as [FormField, FormField];
	const read = readForm([
		{ ...name, settings: { options: [{ id: "a", label: "A" }], min: 3 } },
		email,
	]);
	assert.ok(read.ok);
	if (read.ok) assert.deepEqual(read.fields[0]?.settings, {});
	const bad = (field: FormField) =>
		formProblems([name, email, field], none)[0]?.message ?? "";
	assert.match(
		bad({
			...newField("short_text"),
			settings: { minLength: 10, maxLength: 5 },
		}),
		/least/,
	);
	assert.match(
		bad({ ...newField("number"), settings: { min: 10, max: 5 } }),
		/smallest/,
	);
	assert.match(
		bad({ ...newField("date"), settings: { noFuture: true, noPast: true } }),
		/not both/,
	);
	assert.match(
		bad({ ...newField("email"), settings: { domains: ["not a domain"] } }),
		/not a domain/,
	);
	assert.match(
		bad({ ...newField("file"), settings: { accept: [], maxSizeMb: 5 } }),
		/which files/,
	);
	assert.match(
		bad({ ...newField("file"), settings: { accept: ["pdf"], maxSizeMb: 50 } }),
		/1 to 10/,
	);
	assert.match(
		bad({ ...newField("consent"), settings: { linkUrl: "http://x.com" } }),
		/https/,
	);
	assert.match(
		bad({
			...newField("radio"),
			settings: {
				options: [
					{ id: "a", label: "Yes" },
					{ id: "b", label: "yes" },
				],
			},
		}),
		/twice/,
	);
	assert.match(
		bad({
			...newField("select"),
			settings: { options: [{ id: "a", label: "A" }] },
		}),
		/two options/,
	);
	assert.match(bad({ ...newField("heading"), label: "" }), /title/);
	assert.match(
		bad({ ...newField("short_text"), label: "   " }),
		/Write the question/,
	);
	assert.equal(checkForm("nope", none).ok, false);
	assert.equal(
		checkForm(
			Array.from({ length: 61 }, () => ({})),
			none,
		).ok,
		false,
	);
});

test("answers are checked by kind, hidden ones ignored", () => {
	const today = "2026-11-23";
	const check = (
		field: FormField,
		answer: string | string[] | boolean | null,
		other = "",
	) => answerProblem(field, answer, today, other);
	assert.match(
		check({ ...newField("short_text"), required: true }, "  ") ?? "",
		/Answer this/,
	);
	assert.equal(check(newField("short_text"), ""), null);
	assert.match(check(newField("email"), "nope") ?? "", /email address/);
	assert.match(
		check(
			{ ...newField("email"), settings: { domains: ["cet.ac.in"] } },
			"a@gmail.com",
		) ?? "",
		/cet\.ac\.in/,
	);
	assert.equal(
		check(
			{ ...newField("email"), settings: { domains: ["cet.ac.in"] } },
			"a@cs.cet.ac.in",
		),
		null,
	);
	assert.equal(check(newField("phone"), "98765 43210"), null);
	assert.match(check(newField("phone"), "98765 4321") ?? "", /whole phone/);
	assert.match(
		check({ ...newField("number"), settings: { integer: true } }, "2.5") ?? "",
		/whole/,
	);
	assert.match(
		check({ ...newField("number"), settings: { max: 10 } }, "11") ?? "",
		/10 or less/,
	);
	assert.match(
		check(
			{ ...newField("date"), settings: { noFuture: true } },
			"2026-12-01",
		) ?? "",
		/future/,
	);
	assert.match(
		check(
			{ ...newField("url"), settings: { hosts: ["github.com"] } },
			"gitlab.com/a",
		) ?? "",
		/github/,
	);
	assert.match(
		check({ ...newField("consent"), required: true }, false) ?? "",
		/Tick/,
	);
	const pick = {
		...newField("checkboxes"),
		settings: {
			options: [
				{ id: "a", label: "A" },
				{ id: "b", label: "B" },
			],
			maxSelected: 1,
			allowOther: true,
		},
	};
	assert.match(check(pick, ["a", "b"]) ?? "", /at most 1/);
	assert.match(check(pick, ["other"]) ?? "", /Other/);
	assert.equal(check(pick, ["other"], "Robotics"), null);
	const { fields, name, profession, college } = sample();
	const problems = answersProblems(
		fields,
		{ [profession.id]: "working" },
		null,
		today,
	);
	assert.ok(!problems.has(college.id), "hidden college is not required");
	assert.ok(problems.has(name.id), "name is required");
});
