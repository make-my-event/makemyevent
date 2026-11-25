import assert from "node:assert/strict";
import { test } from "node:test";
import { utcOffsetLabel } from "./schedule.ts";
import {
	arrangeZones,
	searchZones,
	zoneName,
	zoneOption,
	zoneShort,
} from "./zones.ts";

const at = new Date("2026-11-26T06:00:00Z");
const all = Intl.supportedValuesOf("timeZone");
const listed = ["UTC", ...all].flatMap((zone) => zoneOption(zone, at) ?? []);
const options = arrangeZones(listed, null);
const found = (query: string) =>
	searchZones(options, query).map((option) => option.name);

test("India is found however it is looked for", () => {
	for (const query of [
		"kolkata",
		"calcutta",
		"5:30",
		"+5:30",
		"05:30",
		"UTC+05:30",
		"gmt+5:30",
		"India",
		"IST",
		"asia kol",
	])
		assert.ok(
			found(query).some((name) => /Kolkata|Calcutta/.test(name)),
			query,
		);
	assert.ok(!found("5:30").includes("America/New York"));
	assert.deepEqual(found("nowhere at all"), []);
});

test("each zone is there once, west to east, under its present name", () => {
	const names = options.map((option) => option.name);
	assert.equal(new Set(names).size, names.length);
	assert.ok(names.includes("UTC"));
	assert.ok(names.indexOf("America/New York") < names.indexOf("Europe/London"));
	assert.ok(names.indexOf("Europe/London") < names.indexOf("Asia/Tokyo"));
	assert.equal(zoneName("Asia/Calcutta"), "Asia/Kolkata");
	const both = arrangeZones(
		["Asia/Calcutta", "Asia/Kolkata"].flatMap((z) => zoneOption(z, at) ?? []),
		null,
	);
	assert.equal(both.filter((o) => o.name === "Asia/Kolkata").length, 1);
});

test("the zone already chosen keeps its own id", () => {
	for (const saved of ["Asia/Kolkata", "Asia/Calcutta"])
		assert.equal(
			arrangeZones(listed, zoneOption(saved, at)).find(
				(o) => o.name === "Asia/Kolkata",
			)?.zone,
			saved,
		);
	assert.equal(zoneOption("Not/AZone", at), null);
});

test("offsets read as the schedule writes them", () => {
	for (const option of options)
		assert.equal(option.offset, utcOffsetLabel(option.zone, at), option.zone);
});

test("the name beside a time", () => {
	assert.equal(zoneShort(at, "Asia/Kolkata"), "GMT+5:30");
	assert.equal(zoneShort(at, null), "UTC");
	assert.equal(zoneShort(at, "Not/AZone"), "");
});
