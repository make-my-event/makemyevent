import assert from "node:assert/strict";
import { test } from "node:test";
import {
	checkSchedule,
	durationLabel,
	utcOffsetLabel,
	utcToZoned,
	zonedToUtc,
} from "./schedule.ts";
import { checkVenue } from "./venue.ts";

test("wall clock to instant and back, in zones with and without daylight saving", () => {
	assert.equal(
		zonedToUtc("2026-12-12", "09:30", "Asia/Kolkata")?.toISOString(),
		"2026-12-12T04:00:00.000Z",
	);
	assert.equal(
		zonedToUtc("2026-07-01", "09:00", "Europe/London")?.toISOString(),
		"2026-07-01T08:00:00.000Z",
	);
	assert.equal(
		zonedToUtc("2026-01-01", "09:00", "Europe/London")?.toISOString(),
		"2026-01-01T09:00:00.000Z",
	);
	assert.equal(
		zonedToUtc("2026-12-12", "09:30", "America/New_York")?.toISOString(),
		"2026-12-12T14:30:00.000Z",
	);
	// The hour that does not exist when clocks go forward moves past it.
	assert.equal(
		zonedToUtc("2026-03-29", "01:30", "Europe/London")?.toISOString(),
		"2026-03-29T01:30:00.000Z",
	);
	for (const [date, time, zone] of [
		["2026-12-12", "09:30", "Asia/Kolkata"],
		["2026-10-25", "23:15", "Europe/Berlin"],
		["2026-03-08", "12:00", "America/Los_Angeles"],
	] as const) {
		const instant = zonedToUtc(date, time, zone);
		assert.ok(instant);
		assert.deepEqual(
			utcToZoned(instant, zone),
			{ date, time },
			`${date} ${time} ${zone}`,
		);
	}
	assert.equal(zonedToUtc("2026-02-31", "09:00", "Asia/Kolkata"), null);
	assert.equal(zonedToUtc("2026-12-12", "25:00", "Asia/Kolkata"), null);
	assert.equal(zonedToUtc("2026-12-12", "09:00", "Mars/Olympus"), null);
	assert.equal(utcOffsetLabel("Asia/Kolkata", new Date()), "UTC+05:30");
	assert.equal(
		utcOffsetLabel("America/St_Johns", new Date("2026-01-15")),
		"UTC−03:30",
	);
});

test("durations read at a glance", () => {
	assert.equal(durationLabel(8 * 3600e3), "8h 00m");
	assert.equal(durationLabel(90 * 60e3), "1h 30m");
	assert.equal(durationLabel(26 * 3600e3), "1 day 2h");
	assert.equal(durationLabel(3 * 86400e3), "3 days");
	assert.equal(durationLabel(0), "");
});

const blank = {
	timeZone: "",
	startDate: "",
	startTime: "",
	endDate: "",
	endTime: "",
	opensAt: "",
	closesAt: "",
};
const full = {
	timeZone: "Asia/Kolkata",
	startDate: "2026-12-12",
	startTime: "09:30",
	endDate: "2026-12-12",
	endTime: "17:30",
	opensAt: "2026-11-22T09:00",
	closesAt: "2026-12-10T23:59",
};

test("schedule: empty is fine on a draft; a full one becomes instants", () => {
	assert.deepEqual(checkSchedule(blank), {
		ok: true,
		values: {
			timeZone: null,
			startsAt: null,
			endsAt: null,
			opensAt: null,
			closesAt: null,
		},
	});
	const ok = checkSchedule(full);
	assert.ok(ok.ok);
	assert.equal(ok.values.startsAt?.toISOString(), "2026-12-12T04:00:00.000Z");
	assert.equal(ok.values.closesAt?.toISOString(), "2026-12-10T18:29:00.000Z");
});

test("schedule: each mistake names its field", () => {
	const field = (input: typeof full) => {
		const r = checkSchedule(input);
		return r.ok ? "ok" : r.field;
	};
	assert.equal(field({ ...full, timeZone: "" }), "timeZone");
	assert.equal(field({ ...full, timeZone: "Nowhere/Land" }), "timeZone");
	assert.equal(field({ ...full, startTime: "" }), "start");
	assert.equal(field({ ...full, endDate: "", endTime: "" }), "end");
	assert.equal(field({ ...full, endTime: "09:00" }), "end");
	assert.equal(field({ ...full, closesAt: "2026-11-01T09:00" }), "closesAt");
	assert.equal(field({ ...full, closesAt: "2026-12-13T09:00" }), "closesAt");
	assert.equal(
		field({ ...full, opensAt: "2026-12-12T18:00", closesAt: "" }),
		"opensAt",
	);
	assert.equal(field({ ...full, opensAt: "", closesAt: "" }), "ok");
});

test("venue: format decides what is kept; links and pins are checked", () => {
	const base = {
		format: "offline",
		venueAddress: " Fort Kochi ",
		venueName: "Pepper House",
		lat: 9.9658,
		lng: 76.2421,
		onlineUrl: "https://meet.example/x",
	};
	const offline = checkVenue(base);
	assert.ok(offline.ok);
	assert.deepEqual(offline.values, {
		format: "offline",
		venueAddress: "Fort Kochi",
		venueName: "Pepper House",
		venueLat: 9.9658,
		venueLng: 76.2421,
		onlineUrl: null,
	});
	const online = checkVenue({ ...base, format: "online" });
	assert.ok(online.ok);
	assert.deepEqual(online.values, {
		format: "online",
		venueAddress: null,
		venueName: null,
		venueLat: null,
		venueLng: null,
		onlineUrl: "https://meet.example/x",
	});
	const hybrid = checkVenue({
		...base,
		format: "hybrid",
		onlineUrl: "meet.example/y",
	});
	assert.ok(hybrid.ok);
	assert.equal(hybrid.values.onlineUrl, "https://meet.example/y");
	assert.equal(hybrid.values.venueName, "Pepper House");
	for (const onlineUrl of [
		"javascript:alert(1)",
		"http://plain.example",
		"mailto:a@b.org",
	]) {
		const r = checkVenue({ ...base, format: "online", onlineUrl });
		assert.equal(r.ok ? "ok" : r.field, "onlineUrl", onlineUrl);
	}
	const badPin = checkVenue({ ...base, lat: 120 });
	assert.equal(badPin.ok ? "ok" : badPin.field, "pin");
	assert.equal(checkVenue({ ...base, format: "teleport" }).ok, false);
});
