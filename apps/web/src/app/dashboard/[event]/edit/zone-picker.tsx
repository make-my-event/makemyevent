"use client";

import {
	arrangeZones,
	searchZones,
	utcOffsetLabel,
	type ZoneOption,
	zoneName,
	zoneOption,
} from "@makemyevent/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { browserZone } from "@/lib/browser-zone";
import styles from "./schedule-venue.module.css";

/**
 * Every zone the browser knows. Reading one's offset and name takes it a
 * moment, so they are read a few at a time while nothing else is going on,
 * once per visit, and never while the page is being drawn.
 */
let built: ZoneOption[] | null = null;
let building = false;
const waiting = new Set<(zones: ZoneOption[]) => void>();
const PER_STEP = 12;

function buildZones() {
	building = true;
	const names = [
		"UTC",
		...(typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("timeZone")
			: []),
	];
	const now = new Date();
	const found: ZoneOption[] = [];
	let at = 0;
	const step = () => {
		for (const zone of names.slice(at, at + PER_STEP)) {
			const option = zoneOption(zone, now);
			if (option) found.push(option);
		}
		at += PER_STEP;
		if (at < names.length) later(step);
		else {
			built = found;
			for (const tell of waiting) tell(found);
			waiting.clear();
		}
	};
	later(step);
}

function later(work: () => void) {
	if (typeof window.requestIdleCallback === "function")
		window.requestIdleCallback(work, { timeout: 200 });
	else window.setTimeout(work, 0);
}

function useZones(): ZoneOption[] | null {
	const [zones, setZones] = useState<ZoneOption[] | null>(null);
	useEffect(() => {
		if (built) {
			setZones(built);
			return;
		}
		waiting.add(setZones);
		if (!building) buildZones();
		return () => {
			waiting.delete(setZones);
		};
	}, []);
	return zones;
}

/**
 * The event's time zone, found by typing: a city, a country's time ("India"),
 * its initials ("IST") or its offset ("5:30"). A combobox: arrows to move,
 * Enter to pick, Escape to put back what was there.
 *
 * The host's own zone comes first. The offset shown is the one on the day
 * the event starts, so it is right across a daylight-saving change.
 */
export function ZonePicker({
	value,
	at,
	error,
	onChange,
}: {
	value: string;
	/** When the event starts; now while it has no date. */
	at: Date | null;
	error: string | null;
	onChange: (zone: string) => void;
}) {
	const id = useId();
	const listId = `${id}list`;
	const zones = useZones();
	const boxRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	// What is being typed; null when the box shows the zone chosen.
	const [query, setQuery] = useState<string | null>(null);
	const [active, setActive] = useState(0);
	// The browser's own zone, once there is a browser.
	const [own, setOwn] = useState("");
	useEffect(() => setOwn(browserZone()), []);

	const shown = value ? `${zoneName(value)} (${offsetOf(value, at)})` : "";

	const options = useMemo(() => {
		if (!zones) return [];
		const all = arrangeZones(
			zones,
			value ? zoneOption(value, new Date()) : null,
		);
		const found = query?.trim() ? searchZones(all, query) : all;
		// Theirs first, whether listing everything or searching.
		const mine = found.filter((option) => option.name === zoneName(own));
		return [...mine, ...found.filter((option) => !mine.includes(option))];
	}, [zones, value, query, own]);

	useEffect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (boxRef.current?.contains(event.target as Node)) return;
			setOpen(false);
			setQuery(null);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);

	// The one the arrows are on stays in sight.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scrolls again when the list changes
	useEffect(() => {
		if (!open) return;
		listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
	}, [open, active, options]);

	function show() {
		setOpen(true);
		setActive(
			Math.max(
				0,
				options.findIndex((option) => option.zone === value),
			),
		);
	}

	function close() {
		setOpen(false);
		setQuery(null);
	}

	function pick(option: ZoneOption) {
		onChange(option.zone);
		close();
	}

	const status = !open
		? ""
		: !zones
			? "Loading time zones"
			: options.length === 0
				? "No time zone matches. Try a city or an offset, like 5:30."
				: `${options.length} time ${options.length === 1 ? "zone" : "zones"}`;

	return (
		<div className={styles.field} ref={boxRef}>
			<label className={styles.label} htmlFor={`${id}input`}>
				Time zone
			</label>
			<div className={styles.searchBox}>
				<input
					id={`${id}input`}
					className={`${styles.input} ${styles.zoneInput}`}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={open}
					aria-controls={listId}
					aria-activedescendant={
						open && options[active] ? `${id}opt${active}` : undefined
					}
					aria-invalid={error ? true : undefined}
					aria-describedby={`${id}hint`}
					autoComplete="off"
					spellCheck={false}
					placeholder="Search a city, or an offset like 5:30"
					value={query ?? shown}
					onFocus={(event) => event.currentTarget.select()}
					onClick={() => {
						if (!open) show();
					}}
					onBlur={(event) => {
						// Tabbing on keeps the zone that was there.
						if (!boxRef.current?.contains(event.relatedTarget as Node)) close();
					}}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
						setActive(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							event.preventDefault();
							if (!open) show();
							else if (options.length > 0)
								setActive(
									(current) =>
										(current +
											(event.key === "ArrowDown" ? 1 : -1) +
											options.length) %
										options.length,
								);
						} else if (event.key === "Enter" && open) {
							event.preventDefault();
							const option = options[active];
							if (option) pick(option);
						} else if (event.key === "Escape" && open) {
							event.preventDefault();
							close();
						}
					}}
				/>
				<ChevronDownIcon className={styles.zoneChevron} />
				<div
					ref={listRef}
					id={listId}
					role="listbox"
					aria-label="Time zones"
					className={styles.options}
					hidden={!open || options.length === 0}
				>
					{open
						? options.map((option, index) => (
								// biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled on the combobox input, as the pattern requires
								<div
									key={option.name}
									id={`${id}opt${index}`}
									role="option"
									tabIndex={-1}
									aria-selected={option.zone === value}
									data-active={index === active || undefined}
									className={`${styles.option} ${styles.zoneOption}`}
									onPointerDown={(event) => event.preventDefault()}
									onClick={() => pick(option)}
									onPointerMove={() => setActive(index)}
								>
									<span className={styles.zoneOffset}>{option.offset}</span>
									<span className={styles.zoneText}>
										<span className={styles.optionName}>
											{option.name}
											{option.name === zoneName(own) ? (
												<span className={styles.zoneOwn}> (yours)</span>
											) : null}
										</span>
										<span className={styles.optionLabel}>
											{option.longName}
										</span>
									</span>
								</div>
							))
						: null}
				</div>
			</div>
			<p className={styles.hint} id={`${id}hint`} aria-live="polite">
				{error ? (
					<span className={styles.error}>{error}</span>
				) : (
					status || "Every date and time below is in this zone"
				)}
			</p>
			{!value && own ? (
				<button
					type="button"
					className={styles.clearButton}
					onClick={() => onChange(own)}
				>
					Use {zoneName(own)} ({offsetOf(own, at)})
				</button>
			) : null}
		</div>
	);
}

function offsetOf(zone: string, at: Date | null): string {
	try {
		return utcOffsetLabel(zone, at ?? new Date());
	} catch {
		return "";
	}
}
