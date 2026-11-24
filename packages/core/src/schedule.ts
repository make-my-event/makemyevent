import { z } from "zod";

/**
 * When an event happens and when people can register, entered as the host
 * sees it: a date and a time on the clock where the event is, plus that
 * place's time zone. Stored as exact instants; shown back in the event's
 * zone, whatever zone the reader is in.
 *
 * No date library: the platform's Intl does time zones, including daylight
 * saving, and these helpers are tested across those changes.
 */

/** Whether a name is a time zone the platform knows ("Asia/Kolkata"). */
export function isTimeZone(name: string): boolean {
	if (!name || name.length > 64) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: name });
		return true;
	} catch {
		return false;
	}
}

function partsIn(instant: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(instant);
	const get = (type: string) =>
		Number(parts.find((part) => part.type === type)?.value ?? "0");
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		hour: get("hour"),
		minute: get("minute"),
		second: get("second"),
	};
}

/** Minutes the zone is ahead of UTC at that instant: Kolkata +330. */
export function offsetMinutes(instant: Date, timeZone: string): number {
	const p = partsIn(instant, timeZone);
	const asUtc = Date.UTC(
		p.year,
		p.month - 1,
		p.day,
		p.hour,
		p.minute,
		p.second,
	);
	return Math.round(
		(asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000,
	);
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

/**
 * The instant a wall-clock date and time happen in a zone, or null if the
 * input is not a real date and time. A time skipped by a daylight-saving
 * jump moves forward past it, as clocks do.
 */
export function zonedToUtc(
	date: string,
	time: string,
	timeZone: string,
): Date | null {
	const d = DATE.exec(date);
	const t = TIME.exec(time);
	if (!d || !t || !isTimeZone(timeZone)) return null;
	const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(
		Number,
	) as [number, number, number, number, number];
	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hour > 23 ||
		minute > 59
	)
		return null;
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	const probe = new Date(wall);
	if (probe.getUTCDate() !== day) return null; // 31 February and the like
	// Two passes: the offset at a first guess, then at the result, which
	// settles on the right side of a daylight-saving change.
	let instant = wall - offsetMinutes(probe, timeZone) * 60000;
	instant = wall - offsetMinutes(new Date(instant), timeZone) * 60000;
	return new Date(instant);
}

/** An instant as a date and time on the zone's clock: "2026-12-12", "09:30". */
export function utcToZoned(instant: Date, timeZone: string) {
	const p = partsIn(instant, timeZone);
	const pad = (n: number) => String(n).padStart(2, "0");
	return {
		date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
		time: `${pad(p.hour)}:${pad(p.minute)}`,
	};
}

/** "UTC+05:30" for a zone at an instant. */
export function utcOffsetLabel(timeZone: string, at: Date): string {
	const minutes = offsetMinutes(at, timeZone);
	const sign = minutes < 0 ? "−" : "+";
	const abs = Math.abs(minutes);
	return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** How long, in the words a host reads at a glance: "8h 00m", "2 days 3h". */
export function durationLabel(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "";
	const minutes = Math.round(ms / 60000);
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	const mins = minutes % 60;
	if (days > 0)
		return `${days} ${days === 1 ? "day" : "days"}${hours ? ` ${hours}h` : ""}${mins ? ` ${String(mins).padStart(2, "0")}m` : ""}`;
	return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

export type ScheduleField =
	| "timeZone"
	| "start"
	| "end"
	| "opensAt"
	| "closesAt";
export type ScheduleValues = {
	timeZone: string | null;
	startsAt: Date | null;
	endsAt: Date | null;
	opensAt: Date | null;
	closesAt: Date | null;
};

/** The schedule as the form sends it: every part may be empty on a draft. */
export const scheduleInput = z.object({
	timeZone: z.string().trim(),
	startDate: z.string().trim(),
	startTime: z.string().trim(),
	endDate: z.string().trim(),
	endTime: z.string().trim(),
	/** "2026-11-22T09:00" on the event's clock, or empty. */
	opensAt: z.string().trim(),
	closesAt: z.string().trim(),
});
export type ScheduleInput = z.infer<typeof scheduleInput>;

type Checked =
	| { ok: true; values: ScheduleValues }
	| { ok: false; field: ScheduleField; message: string };

/**
 * Turns the form's schedule into instants, or says which field is wrong and
 * how. A draft may leave everything empty; what it does fill must make sense.
 */
export function checkSchedule(input: ScheduleInput): Checked {
	const fail = (field: ScheduleField, message: string): Checked => ({
		ok: false,
		field,
		message,
	});
	const anyDate =
		input.startDate ||
		input.startTime ||
		input.endDate ||
		input.endTime ||
		input.opensAt ||
		input.closesAt;
	if (!input.timeZone)
		return anyDate
			? fail("timeZone", "Choose the time zone the event happens in.")
			: {
					ok: true,
					values: {
						timeZone: null,
						startsAt: null,
						endsAt: null,
						opensAt: null,
						closesAt: null,
					},
				};
	if (!isTimeZone(input.timeZone))
		return fail("timeZone", "Choose a time zone from the list.");
	const zone = input.timeZone;

	const pair = (date: string, time: string, field: "start" | "end") => {
		if (!date && !time) return { at: null as Date | null };
		if (!date || !time)
			return {
				error: fail(
					field,
					`Give both a date and a time for when it ${field === "start" ? "starts" : "ends"}.`,
				),
			};
		const at = zonedToUtc(date, time, zone);
		return at
			? { at }
			: { error: fail(field, "That date or time is not valid.") };
	};
	const start = pair(input.startDate, input.startTime, "start");
	if ("error" in start && start.error) return start.error;
	const end = pair(input.endDate, input.endTime, "end");
	if ("error" in end && end.error) return end.error;
	const startsAt = start.at ?? null;
	const endsAt = end.at ?? null;
	if (endsAt && !startsAt) return fail("start", "Add when the event starts.");
	if (startsAt && !endsAt) return fail("end", "Add when the event ends.");
	if (startsAt && endsAt && endsAt <= startsAt)
		return fail("end", "The event has to end after it starts.");

	const moment = (value: string, field: "opensAt" | "closesAt") => {
		if (!value) return { at: null as Date | null };
		const [date = "", time = ""] = value.split("T");
		const at = zonedToUtc(date, time.slice(0, 5), zone);
		return at
			? { at }
			: { error: fail(field, "That date or time is not valid.") };
	};
	const opens = moment(input.opensAt, "opensAt");
	if ("error" in opens && opens.error) return opens.error;
	const closes = moment(input.closesAt, "closesAt");
	if ("error" in closes && closes.error) return closes.error;
	const opensAt = opens.at ?? null;
	const closesAt = closes.at ?? null;
	if (opensAt && closesAt && closesAt <= opensAt)
		return fail("closesAt", "Registration has to close after it opens.");
	if (closesAt && endsAt && closesAt > endsAt)
		return fail(
			"closesAt",
			"Registration has to close by the time the event ends.",
		);
	if (opensAt && endsAt && opensAt >= endsAt)
		return fail("opensAt", "Registration has to open before the event ends.");

	return {
		ok: true,
		values: { timeZone: zone, startsAt, endsAt, opensAt, closesAt },
	};
}
