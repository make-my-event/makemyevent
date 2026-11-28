"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { type DoorFilter, type DoorGuest, doorGuests } from "./actions";
import { clock } from "./door-time";
import styles from "./scanner.module.css";

const SEARCH_MS = 250;
/** Read again anyway, now and then, for a change the count can't show. */
const FALLBACK_MS = 60_000;
/** After a failed read: soon, not in a minute. */
const RETRY_MS = 5000;
const PAGE = 30;
const TAKE_MAX = 300;

const FILTERS: { value: DoorFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "in", label: "Checked in" },
	{ value: "out", label: "Not yet" },
];

/**
 * The door's guest list: search by name or code, all or in or not yet,
 * each with their ticket and code, and when, by whom and at which door
 * they came in. Not-yet rows have Check in; open a row that's in for Undo.
 * Read again after each check-in at this phone, when the shared count
 * changes (another door's scan, an undo, a walk-in), and once a minute
 * anyway; never while the screen is hidden or offline.
 */
export function DoorGuests({
	eventId,
	version,
	stamp,
	total,
	onCheckIn,
	onUndo,
	onWalkIn,
}: {
	eventId: string;
	/** Bumped after a check-in or an undo here: read the list again. */
	version: number;
	/** Today's count, as last read: when it changes, read the list again. */
	stamp: string | null;
	/** Everyone with a place, for the heading. */
	total: number | null;
	onCheckIn: (guest: DoorGuest) => Promise<void>;
	onUndo: (guest: DoorGuest) => Promise<void>;
	/** Shown to those who may add guests. */
	onWalkIn: (() => void) | null;
}) {
	const id = useId();
	const [filter, setFilter] = useState<DoorFilter>("all");
	const [query, setQuery] = useState("");
	const [guests, setGuests] = useState<DoorGuest[] | null>(null);
	const [next, setNext] = useState<string | null>(null);
	const [open, setOpen] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const asked = useRef(0);

	const shown = useRef(0);
	shown.current = guests?.length ?? 0;

	/** From the top: the first `take` rows, as one read. */
	const load = useCallback(
		async (take: number) => {
			const ask = ++asked.current;
			try {
				const got = await doorGuests(eventId, { filter, query, take });
				if (!got || ask !== asked.current) return;
				setGuests(got.guests);
				setNext(got.next);
				setFailed(false);
			} catch {
				if (ask === asked.current) setFailed(true);
			}
		},
		[eventId, filter, query],
	);
	/** What's on screen, read again in one go. */
	const reload = useCallback(
		() => load(Math.min(Math.max(shown.current, PAGE), TAKE_MAX)),
		[load],
	);

	// A new search or filter: from the first page, after typing pauses.
	useEffect(() => {
		const timer = window.setTimeout(
			() => void load(PAGE),
			query ? SEARCH_MS : 0,
		);
		return () => window.clearTimeout(timer);
	}, [load, query]);

	// After a check-in here, when the count moves, and now and then anyway.
	// biome-ignore lint/correctness/useExhaustiveDependencies: version and stamp are the triggers
	useEffect(() => {
		if (version > 0) void reload();
	}, [version]);
	const seen = useRef(stamp);
	// biome-ignore lint/correctness/useExhaustiveDependencies: stamp is the trigger
	useEffect(() => {
		if (stamp === seen.current) return;
		seen.current = stamp;
		void reload();
	}, [stamp]);
	useEffect(() => {
		const timer = window.setInterval(
			() => {
				if (document.visibilityState === "visible" && navigator.onLine)
					void reload();
			},
			failed ? RETRY_MS : FALLBACK_MS,
		);
		return () => window.clearInterval(timer);
	}, [reload, failed]);

	/** The next page, after the last row shown. */
	async function more() {
		if (!next) return;
		const ask = ++asked.current;
		try {
			const got = await doorGuests(eventId, { filter, query, after: next });
			if (!got || ask !== asked.current) return;
			setGuests((now) => [
				...(now ?? []),
				...got.guests.filter((g) => !now?.some((n) => n.id === g.id)),
			]);
			setNext(got.next);
		} catch {
			if (ask === asked.current) setFailed(true);
		}
	}

	async function act(guest: DoorGuest, work: (g: DoorGuest) => Promise<void>) {
		setBusy(guest.id);
		await work(guest);
		setBusy(null);
	}

	return (
		<section className={styles.guests} aria-labelledby={`${id}h`}>
			<div className={styles.guestsHead}>
				<h3 className={styles.guestsTitle} id={`${id}h`}>
					Guests
					{total !== null ? (
						<span className={styles.meta}> {total}</span>
					) : null}
				</h3>
				{onWalkIn ? (
					<button
						type="button"
						className={styles.secondaryButton}
						onClick={onWalkIn}
					>
						<PlusIcon /> Walk-in
					</button>
				) : null}
			</div>

			<div className={styles.guestsTools}>
				<label className={styles.srOnly} htmlFor={`${id}s`}>
					Search guests
				</label>
				<input
					id={`${id}s`}
					className={styles.search}
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search by name or code"
					autoComplete="off"
					spellCheck={false}
					maxLength={80}
				/>
				<fieldset className={styles.filters}>
					<legend className={styles.srOnly}>Show</legend>
					{FILTERS.map((f) => (
						<label key={f.value} className={styles.filter}>
							<input
								type="radio"
								name={`${id}f`}
								className={styles.srOnly}
								checked={filter === f.value}
								onChange={() => setFilter(f.value)}
							/>
							{f.label}
						</label>
					))}
				</fieldset>
			</div>

			{failed ? (
				<p className={styles.listNote} role="alert">
					The list couldn't be loaded. It tries again in a few seconds.
				</p>
			) : guests === null ? (
				<ul className={styles.rows} aria-busy="true">
					{[0, 1, 2].map((n) => (
						<li key={n} className={styles.row}>
							<span className={`${styles.bone} ${styles.boneRow}`} />
						</li>
					))}
				</ul>
			) : guests.length === 0 ? (
				<p className={styles.listNote}>
					{query
						? "No guest with a place matches. Check the spelling, or try their code."
						: filter === "in"
							? "No one is in yet today."
							: filter === "out"
								? "Everyone with a place is in."
								: "No one has a place yet."}
				</p>
			) : (
				<ul className={styles.rows}>
					{guests.map((g) => {
						const expanded = open === g.id;
						return (
							<li key={g.id} className={styles.row}>
								<div className={styles.rowMain}>
									<span
										className={styles.dot}
										data-in={g.in ? true : undefined}
										aria-hidden="true"
									/>
									<span className={styles.rowText}>
										<span className={styles.rowName}>{g.name}</span>
										<span className={styles.meta}>
											{g.ticket}, <span className={styles.mono}>{g.code}</span>
										</span>
									</span>
									{g.in ? (
										<button
											type="button"
											className={styles.rowIn}
											aria-expanded={expanded}
											aria-controls={`${id}${g.id}`}
											onClick={() => setOpen(expanded ? null : g.id)}
										>
											{clock(new Date(g.in.at).getTime())}
											{g.in.door ? `, ${g.in.door}` : ""}
										</button>
									) : (
										<button
											type="button"
											className={styles.secondaryButton}
											disabled={busy === g.id}
											aria-busy={busy === g.id || undefined}
											onClick={() => void act(g, onCheckIn)}
										>
											{busy === g.id ? "Checking…" : "Check in"}
										</button>
									)}
								</div>
								{g.in && expanded ? (
									<div className={styles.rowMore} id={`${id}${g.id}`}>
										<p className={styles.meta}>
											In at {clock(new Date(g.in.at).getTime())}
											{g.in.by ? `, by ${g.in.by}` : ""}
											{g.in.door ? `, at ${g.in.door}` : ""}
										</p>
										<button
											type="button"
											className={styles.linkButton}
											disabled={busy === g.id}
											onClick={() => void act(g, onUndo)}
										>
											{busy === g.id ? "Undoing…" : "Undo check-in"}
										</button>
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
			)}

			{next ? (
				<button
					type="button"
					className={styles.more}
					onClick={() => void more()}
				>
					Show more
				</button>
			) : null}
		</section>
	);
}
