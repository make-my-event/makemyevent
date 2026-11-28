"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { type DoorFilter, type DoorGuest, doorGuests } from "./actions";
import { clock } from "./door-time";
import styles from "./scanner.module.css";

const SEARCH_MS = 250;
const REFRESH_MS = 15_000;

const FILTERS: { value: DoorFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "in", label: "Checked in" },
	{ value: "out", label: "Not yet" },
];

/**
 * The door's guest list: search by name or code, all or in or not yet,
 * each with their ticket and code, and when, by whom and at which door
 * they came in. Not-yet rows have Check in; open a row that's in for Undo.
 * Refreshed after each check-in at this phone and every few seconds, for
 * the other doors' scans.
 */
export function DoorGuests({
	eventId,
	version,
	total,
	onCheckIn,
	onUndo,
	onWalkIn,
}: {
	eventId: string;
	/** Bumped after a check-in or an undo here: read the list again. */
	version: number;
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
	const [pages, setPages] = useState(1);
	const [more, setMore] = useState(false);
	const [open, setOpen] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const asked = useRef(0);

	/** The first `count` pages, as one list: what's shown, read again. */
	const load = useCallback(
		async (count: number) => {
			const ask = ++asked.current;
			try {
				const all: DoorGuest[] = [];
				let next = false;
				for (let page = 0; page < count; page++) {
					const got = await doorGuests(eventId, { filter, query, page });
					if (!got) return;
					all.push(...got.guests);
					next = got.more;
					if (!got.more) break;
				}
				if (ask !== asked.current) return;
				setGuests(all);
				setMore(next);
				setFailed(false);
			} catch {
				if (ask === asked.current) setFailed(true);
			}
		},
		[eventId, filter, query],
	);

	// A new search or filter: from the first page, after typing pauses.
	useEffect(() => {
		setPages(1);
		const timer = window.setTimeout(() => void load(1), query ? SEARCH_MS : 0);
		return () => window.clearTimeout(timer);
	}, [load, query]);

	// After a check-in here, and every few seconds for the other doors.
	// biome-ignore lint/correctness/useExhaustiveDependencies: version is the trigger
	useEffect(() => {
		if (version > 0) void load(pages);
	}, [version]);
	useEffect(() => {
		const timer = window.setInterval(() => {
			if (document.visibilityState === "visible" && navigator.onLine)
				void load(pages);
		}, REFRESH_MS);
		return () => window.clearInterval(timer);
	}, [load, pages]);

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

			{more ? (
				<button
					type="button"
					className={styles.more}
					onClick={() => {
						const next = pages + 1;
						setPages(next);
						void load(next);
					}}
				>
					Show more
				</button>
			) : null}
		</section>
	);
}
