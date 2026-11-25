"use client";

import { durationLabel, zonedToUtc } from "@makemyevent/core";
import { useEffect, useId, useState } from "react";
import { browserZone } from "@/lib/browser-zone";
import styles from "./schedule-venue.module.css";
import { ZonePicker } from "./zone-picker";

export type ScheduleValues = {
	timeZone: string;
	startDate: string;
	startTime: string;
	endDate: string;
	endTime: string;
	/** "2026-11-22T09:00" on the event's clock, or "". */
	opensAt: string;
	closesAt: string;
};

type Field = "timeZone" | "start" | "end" | "opensAt" | "closesAt";

/** "Sat, 12 Dec" in the host's language, for the summary line. */
function shortDate(date: string): string {
	const [y, m, d] = date.split("-").map(Number);
	if (!y || !m || !d) return "";
	return new Intl.DateTimeFormat(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Schedule & Registration: when the event runs, on the clock where it
 * happens, and when people can register. The summary under the dates says
 * how long it runs, so a slip like 9:30 pm for 9:30 am shows at once.
 *
 *   Time zone  [Asia/Kolkata (UTC+05:30)     ▾]
 *   Starts     [12/12/2026] [09:30]
 *   Ends       [12/12/2026] [17:30]
 *   ─ Runs 8h 00m, Sat 12 Dec ────────────────
 *   Registration opens   [ … ]   closes [ … ]
 */
export function ScheduleCard({
	value,
	onChange,
	error,
}: {
	value: ScheduleValues;
	onChange: (next: Partial<ScheduleValues>) => void;
	error: { field: Field; message: string } | null;
}) {
	const id = useId();
	const ids = {
		startDate: `${id}sd`,
		startTime: `${id}st`,
		endDate: `${id}ed`,
		endTime: `${id}et`,
		opens: `${id}op`,
		closes: `${id}cl`,
		summary: `${id}sum`,
	};
	const errorFor = (field: Field) =>
		error?.field === field ? error.message : null;

	// Dates in the host's own format, only in the browser (see the summary).
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// A date put in first picks the host's own zone, so nothing is left
	// half set; they can change it after.
	const set = (next: Partial<ScheduleValues>) =>
		onChange(value.timeZone ? next : { timeZone: browserZone(), ...next });

	// When the start moves and the end was on the same day (or empty), the
	// end follows to that day: the common case is a one-day event.
	const setStartDate = (startDate: string) => {
		const next: Partial<ScheduleValues> = { startDate };
		if (
			!value.endDate ||
			value.endDate === value.startDate ||
			value.endDate < startDate
		)
			next.endDate = startDate;
		set(next);
	};

	const zone = value.timeZone;
	const startsAt =
		zone && value.startDate && value.startTime
			? zonedToUtc(value.startDate, value.startTime, zone)
			: null;
	const endsAt =
		zone && value.endDate && value.endTime
			? zonedToUtc(value.endDate, value.endTime, zone)
			: null;
	const length =
		startsAt && endsAt ? endsAt.getTime() - startsAt.getTime() : null;

	const summary =
		length === null
			? {
					tone: "muted",
					text: "Add a start and an end to see how long it runs.",
				}
			: length <= 0
				? { tone: "error", text: "Ends before it starts." }
				: {
						tone: "ok",
						// Dates in the host's own format, so only in the browser:
						// the server's language may differ, and the two must match.
						text: !mounted
							? `Runs ${durationLabel(length)}`
							: value.startDate === value.endDate
								? `Runs ${durationLabel(length)} on ${shortDate(value.startDate)}`
								: `Runs ${durationLabel(length)}, ${shortDate(value.startDate)} to ${shortDate(value.endDate)}`,
					};

	return (
		<section className={styles.panel} aria-labelledby={`${id}title`}>
			<header className={styles.panelHead}>
				<h3 className={styles.panelTitle} id={`${id}title`}>
					Schedule &amp; Registration
				</h3>
				<p className={styles.panelLead}>When it runs, on local time</p>
			</header>

			<div className={styles.card}>
				<ZonePicker
					value={value.timeZone}
					at={startsAt}
					error={errorFor("timeZone")}
					onChange={(timeZone) => onChange({ timeZone })}
				/>

				<fieldset className={styles.moment}>
					<legend className={styles.label}>Starts</legend>
					<div className={styles.pair}>
						<input
							id={ids.startDate}
							type="date"
							className={styles.input}
							aria-label="Start date"
							value={value.startDate}
							onChange={(event) => setStartDate(event.target.value)}
							aria-invalid={errorFor("start") ? true : undefined}
							aria-describedby={
								errorFor("start") ? `${ids.startDate}e` : ids.summary
							}
						/>
						<input
							id={ids.startTime}
							type="time"
							className={`${styles.input} ${styles.time}`}
							aria-label="Start time"
							value={value.startTime}
							onChange={(event) => set({ startTime: event.target.value })}
							aria-invalid={errorFor("start") ? true : undefined}
							aria-describedby={
								errorFor("start") ? `${ids.startDate}e` : ids.summary
							}
						/>
					</div>
					<FieldError id={`${ids.startDate}e`} message={errorFor("start")} />
				</fieldset>

				<fieldset className={styles.moment}>
					<legend className={styles.label}>Ends</legend>
					<div className={styles.pair}>
						<input
							id={ids.endDate}
							type="date"
							className={styles.input}
							aria-label="End date"
							min={value.startDate || undefined}
							value={value.endDate}
							onChange={(event) => set({ endDate: event.target.value })}
							aria-invalid={errorFor("end") ? true : undefined}
							aria-describedby={
								errorFor("end") ? `${ids.endDate}e` : ids.summary
							}
						/>
						<input
							id={ids.endTime}
							type="time"
							className={`${styles.input} ${styles.time}`}
							aria-label="End time"
							value={value.endTime}
							onChange={(event) => set({ endTime: event.target.value })}
							aria-invalid={errorFor("end") ? true : undefined}
							aria-describedby={
								errorFor("end") ? `${ids.endDate}e` : ids.summary
							}
						/>
					</div>
					<FieldError id={`${ids.endDate}e`} message={errorFor("end")} />
				</fieldset>

				{/* The length of the event, live: the check a host does in their
				    head, done for them. */}
				<p
					className={styles.summary}
					data-tone={summary.tone}
					id={ids.summary}
					aria-live="polite"
				>
					<span className={styles.summaryTrack} aria-hidden="true" />
					<span className={styles.summaryText}>{summary.text}</span>
				</p>

				{/* One row: what it is on the left, the window on the right, as
				    from → to. Empty fields mean the defaults in the caption. */}
				<div className={styles.window}>
					<div className={styles.windowHead}>
						<p className={styles.windowTitle} id={`${id}reg`}>
							Registration
						</p>
						<p className={styles.windowLead} id={`${id}regh`}>
							Blank: open from publish to start
						</p>
					</div>
					<fieldset
						className={styles.windowFields}
						aria-labelledby={`${id}reg`}
						aria-describedby={`${id}regh`}
					>
						<input
							id={ids.opens}
							type="datetime-local"
							className={styles.input}
							aria-label="Registration opens"
							value={value.opensAt}
							max={value.closesAt || undefined}
							onChange={(event) => set({ opensAt: event.target.value })}
							aria-invalid={errorFor("opensAt") ? true : undefined}
							aria-errormessage={
								errorFor("opensAt") ? `${ids.opens}e` : undefined
							}
						/>
						<span className={styles.windowArrow} aria-hidden="true">
							→
						</span>
						<input
							id={ids.closes}
							type="datetime-local"
							className={styles.input}
							aria-label="Registration closes"
							value={value.closesAt}
							min={value.opensAt || undefined}
							max={
								value.endDate && value.endTime
									? `${value.endDate}T${value.endTime}`
									: undefined
							}
							onChange={(event) => set({ closesAt: event.target.value })}
							aria-invalid={errorFor("closesAt") ? true : undefined}
							aria-errormessage={
								errorFor("closesAt") ? `${ids.closes}e` : undefined
							}
						/>
					</fieldset>
					<FieldError id={`${ids.opens}e`} message={errorFor("opensAt")} />
					<FieldError id={`${ids.closes}e`} message={errorFor("closesAt")} />
				</div>
			</div>
		</section>
	);
}

export function FieldError({
	id,
	message,
}: {
	id: string;
	message: string | null;
}) {
	return message ? (
		<p className={styles.hint} id={id}>
			<span className={styles.error}>{message}</span>
		</p>
	) : null;
}
