"use client";

import {
	EVENT_FORMATS,
	type EventFormat,
	FORMAT_LABELS,
} from "@makemyevent/core";
import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { FieldError } from "./schedule-card";
import styles from "./schedule-venue.module.css";

/** The map is heavy (MapLibre): its code loads on its own, behind a frame of the same size. */
const VenueMap = dynamic(() => import("./venue-map"), {
	ssr: false,
	loading: () => (
		<div className={styles.mapFrame} data-loading aria-hidden="true" />
	),
});

export type VenueValues = {
	format: string;
	venueAddress: string;
	venueName: string;
	lat: number | null;
	lng: number | null;
	onlineUrl: string;
};

type Field = "format" | "venueAddress" | "venueName" | "onlineUrl" | "pin";
type Place = { name: string; label: string; lat: number; lng: number };

/**
 * Venue: how people attend, then where. In person and hybrid get a place:
 * a search that fills the address and drops the pin, a name as guests will
 * read it, and the map to set the pin exactly. Online and hybrid get the
 * join link.
 */
export function VenueCard({
	value,
	onChange,
	error,
}: {
	value: VenueValues;
	onChange: (next: Partial<VenueValues>) => void;
	error: { field: Field; message: string } | null;
}) {
	const id = useId();
	// Counts places picked from search, so the map goes to each one.
	const [focus, setFocus] = useState(0);
	// The display name a picked place filled in, so the next pick may
	// replace it. A saved name counts when the saved address begins with it,
	// as a picked place's does.
	const autoName = useRef<string | null>(
		value.venueName.trim() &&
			value.venueAddress.trim().startsWith(value.venueName.trim())
			? value.venueName.trim()
			: null,
	);
	// The latest values, for an address that arrives after a map click.
	const latest = useRef(value);
	latest.current = value;
	const lookupRef = useRef<AbortController | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const [lookup, setLookup] = useState<"idle" | "busy" | "none" | "failed">(
		"idle",
	);
	useEffect(() => () => lookupRef.current?.abort(), []);

	/** A place now holds the pin: its address, and the name unless the host wrote one. */
	const applyPlace = (place: Place) => {
		const follows = nameFollowsPlace(
			latest.current.venueName,
			autoName.current,
		);
		onChange({
			venueAddress: place.label,
			...(follows ? { venueName: place.name } : {}),
			lat: place.lat,
			lng: place.lng,
		});
		if (follows) autoName.current = place.name;
	};

	/** A pin put on the map by hand: it stays exactly there, and the
	 *  address and name are filled from the place at that spot. */
	const pinByHand = async (lat: number, lng: number) => {
		onChange({ lat, lng });
		lookupRef.current?.abort();
		const controller = new AbortController();
		lookupRef.current = controller;
		setLookup("busy");
		try {
			const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`, {
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(String(response.status));
			const body = (await response.json()) as { place: Place | null };
			// Moved again meanwhile: that spot's answer is the one wanted.
			if (latest.current.lat !== lat || latest.current.lng !== lng) return;
			if (body.place) {
				applyPlace({ ...body.place, lat, lng });
				setLookup("idle");
			} else setLookup("none");
		} catch {
			if (!controller.signal.aborted) setLookup("failed");
		}
	};

	/** The address, the pin, and a name the place filled in; a name the
	 *  host wrote stays. */
	const clearLocation = () => {
		lookupRef.current?.abort();
		setLookup("idle");
		const follows = nameFollowsPlace(value.venueName, autoName.current);
		onChange({
			venueAddress: "",
			lat: null,
			lng: null,
			...(follows ? { venueName: "" } : {}),
		});
		if (follows) autoName.current = null;
		// The button goes away: the keyboard starts again at the search.
		searchRef.current?.focus();
	};
	const hasLocation = Boolean(value.venueAddress.trim()) || value.lat !== null;

	const errorFor = (field: Field) =>
		error?.field === field ? error.message : null;
	const format = (EVENT_FORMATS as readonly string[]).includes(value.format)
		? (value.format as EventFormat)
		: "offline";
	const inPerson = format !== "online";
	const online = format !== "offline";

	return (
		<section
			className={`${styles.panel} ${styles.venuePanel}`}
			aria-labelledby={`${id}title`}
		>
			<header className={styles.panelHead}>
				<h3 className={styles.panelTitle} id={`${id}title`}>
					Venue
				</h3>
				<p className={styles.panelLead}>Where guests go</p>
			</header>

			{/* Fields, and beside them (on a wide card) the map, as tall as
			    the row: whatever height the schedule beside it takes, the map
			    uses, so the card has no empty space. */}
			<div
				className={`${styles.card} ${styles.venueCard}`}
				data-map={inPerson ? "" : undefined}
			>
				<div className={styles.venueFields}>
					<FormatPicker
						value={format}
						onChange={(next) => onChange({ format: next })}
					/>

					{inPerson ? (
						<>
							<PlaceSearch
								value={value.venueAddress}
								inputRef={searchRef}
								error={errorFor("venueAddress")}
								onType={(venueAddress) => {
									setLookup("idle");
									onChange({ venueAddress });
								}}
								onPick={(place) => {
									lookupRef.current?.abort();
									setLookup("idle");
									applyPlace(place);
									setFocus((n) => n + 1);
								}}
							/>

							<div className={styles.field}>
								<label className={styles.label} htmlFor={`${id}name`}>
									Display name
								</label>
								<input
									id={`${id}name`}
									className={styles.input}
									value={value.venueName}
									maxLength={200}
									autoComplete="off"
									placeholder="For example: Pepper House, Hall B"
									onChange={(event) =>
										onChange({ venueName: event.target.value })
									}
									aria-invalid={errorFor("venueName") ? true : undefined}
									aria-describedby={`${id}nameh`}
								/>
								<p className={styles.hint} id={`${id}nameh`}>
									{errorFor("venueName") ? (
										<span className={styles.error}>
											{errorFor("venueName")}
										</span>
									) : (
										"What guests see above the address"
									)}
								</p>
							</div>

							<p className={styles.hint} aria-live="polite">
								{lookup === "busy"
									? "Finding the address of this spot…"
									: lookup === "none"
										? "No address known here. The pin is set; type the address in Location."
										: lookup === "failed"
											? "Could not look up this spot. The pin is set; type the address in Location."
											: null}
							</p>
							<FieldError id={`${id}pin`} message={errorFor("pin")} />
							{hasLocation ? (
								<button
									type="button"
									className={styles.clearButton}
									onClick={clearLocation}
								>
									Clear location
								</button>
							) : null}
						</>
					) : null}

					{online ? (
						<div className={styles.field}>
							<label className={styles.label} htmlFor={`${id}url`}>
								Join link
							</label>
							<input
								id={`${id}url`}
								className={styles.input}
								type="url"
								inputMode="url"
								value={value.onlineUrl}
								maxLength={2048}
								autoComplete="off"
								spellCheck={false}
								placeholder="https://meet.example.com/your-event"
								onChange={(event) =>
									onChange({ onlineUrl: event.target.value })
								}
								aria-invalid={errorFor("onlineUrl") ? true : undefined}
								aria-describedby={`${id}urlh`}
							/>
							<p className={styles.hint} id={`${id}urlh`}>
								{errorFor("onlineUrl") ? (
									<span className={styles.error}>{errorFor("onlineUrl")}</span>
								) : (
									"Shown only to people who have registered"
								)}
							</p>
						</div>
					) : null}
				</div>

				{inPerson ? (
					<div className={styles.venueMap}>
						<VenueMap
							lat={value.lat}
							lng={value.lng}
							name={value.venueName.trim() || null}
							focus={focus}
							onPick={pinByHand}
						/>
					</div>
				) : null}
			</div>
		</section>
	);
}

/** Whether a newly picked place may set the display name. */
function nameFollowsPlace(name: string, filledBefore: string | null): boolean {
	const trimmed = name.trim();
	return trimmed === "" || trimmed === filledBefore;
}

/** In person, Online, Hybrid: one choice, as radio buttons drawn as a segmented bar. */
function FormatPicker({
	value,
	onChange,
}: {
	value: EventFormat;
	onChange: (value: EventFormat) => void;
}) {
	const name = useId();
	return (
		<fieldset className={styles.formatSet}>
			<legend className={styles.label}>How people attend</legend>
			<div className={styles.segments}>
				{EVENT_FORMATS.map((format) => (
					<label key={format} className={styles.segment}>
						<input
							type="radio"
							name={name}
							value={format}
							checked={value === format}
							onChange={() => onChange(format)}
							className={styles.segmentInput}
						/>
						<span className={styles.segmentText}>{FORMAT_LABELS[format]}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

/**
 * The address, with places suggested as it is typed (a combobox: arrows to
 * move, Enter to pick, Escape to close). Typing without picking keeps what
 * was typed as the address; the pin is then set on the map.
 */
function PlaceSearch({
	value,
	inputRef,
	error,
	onType,
	onPick,
}: {
	value: string;
	inputRef: React.RefObject<HTMLInputElement | null>;
	error: string | null;
	onType: (value: string) => void;
	onPick: (place: Place) => void;
}) {
	const id = useId();
	const listId = `${id}list`;
	const [query, setQuery] = useState<string | null>(null);
	const [places, setPlaces] = useState<Place[]>([]);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const [status, setStatus] = useState<{
		tone: "muted" | "error";
		text: string;
	} | null>(null);
	const boxRef = useRef<HTMLDivElement>(null);

	// Asks a moment after typing stops; a newer search cancels an older one.
	useEffect(() => {
		if (query === null) return;
		const q = query.trim();
		if (q.length < 3) {
			setPlaces([]);
			setOpen(false);
			setStatus(null);
			return;
		}
		const controller = new AbortController();
		setStatus({ tone: "muted", text: "Searching…" });
		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch(
					`/api/geocode?q=${encodeURIComponent(q)}`,
					{
						signal: controller.signal,
					},
				);
				const body = (await response.json()) as {
					places?: Place[];
					error?: string;
				};
				if (!response.ok) {
					setPlaces([]);
					setOpen(false);
					setStatus({
						tone: "error",
						text: body.error ?? "Place search failed.",
					});
					return;
				}
				const found = body.places ?? [];
				setPlaces(found);
				setActive(-1);
				setOpen(found.length > 0);
				setStatus(
					found.length > 0
						? {
								tone: "muted",
								text: `${found.length} ${found.length === 1 ? "place" : "places"} found`,
							}
						: {
								tone: "muted",
								text: "No places found. Keep the address as typed and set the pin on the map.",
							},
				);
			} catch (caught) {
				if ((caught as Error).name === "AbortError") return;
				setStatus({
					tone: "error",
					text: "Place search is not answering. Set the pin on the map instead.",
				});
			}
		}, 350);
		return () => {
			controller.abort();
			window.clearTimeout(timer);
		};
	}, [query]);

	// A click anywhere else closes the list.
	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", close);
		return () => document.removeEventListener("pointerdown", close);
	}, [open]);

	const pick = (place: Place) => {
		onPick(place);
		setOpen(false);
		setQuery(null);
		setPlaces([]);
		setStatus({
			tone: "muted",
			text: "Pin placed. Drag it or click the map to adjust.",
		});
	};

	const activeId = active >= 0 ? `${id}opt${active}` : undefined;

	return (
		<div className={styles.field} ref={boxRef}>
			<label className={styles.label} htmlFor={`${id}input`}>
				Location
			</label>
			<div className={styles.searchBox}>
				<svg
					className={styles.searchIcon}
					viewBox="0 0 16 16"
					aria-hidden="true"
				>
					<circle
						cx="7"
						cy="7"
						r="4.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
					/>
					<path
						d="m10.5 10.5 3 3"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</svg>
				<input
					ref={inputRef}
					id={`${id}input`}
					className={`${styles.input} ${styles.searchInput}`}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={open}
					aria-controls={listId}
					aria-activedescendant={open ? activeId : undefined}
					aria-invalid={error ? true : undefined}
					aria-describedby={`${id}status`}
					autoComplete="off"
					spellCheck={false}
					maxLength={500}
					placeholder="Search a venue or type the address"
					value={value}
					onChange={(event) => {
						onType(event.target.value);
						setQuery(event.target.value);
					}}
					onFocus={() => {
						if (places.length > 0) setOpen(true);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown" && places.length > 0) {
							event.preventDefault();
							setOpen(true);
							setActive((current) => (current + 1) % places.length);
						} else if (event.key === "ArrowUp" && places.length > 0) {
							event.preventDefault();
							setOpen(true);
							setActive((current) =>
								current <= 0 ? places.length - 1 : current - 1,
							);
						} else if (event.key === "Enter" && open && active >= 0) {
							event.preventDefault();
							const place = places[active];
							if (place) pick(place);
						} else if (event.key === "Escape" && open) {
							event.preventDefault();
							setOpen(false);
						}
					}}
				/>
				<div
					id={listId}
					role="listbox"
					aria-label="Places"
					className={styles.options}
					hidden={!open}
				>
					{places.map((place, index) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled on the combobox input, as the pattern requires
						<div
							key={`${place.lat},${place.lng},${place.label}`}
							id={`${id}opt${index}`}
							role="option"
							tabIndex={-1}
							aria-selected={index === active}
							className={styles.option}
							onPointerDown={(event) => event.preventDefault()}
							onClick={() => pick(place)}
							onPointerEnter={() => setActive(index)}
						>
							<span className={styles.optionName}>{place.name}</span>
							<span className={styles.optionLabel}>{place.label}</span>
						</div>
					))}
				</div>
			</div>
			<p className={styles.hint} id={`${id}status`} aria-live="polite">
				{error ? (
					<span className={styles.error}>{error}</span>
				) : status ? (
					<span className={status.tone === "error" ? styles.error : undefined}>
						{status.text}
					</span>
				) : (
					"Pick a suggestion to place the pin"
				)}
			</p>
		</div>
	);
}
