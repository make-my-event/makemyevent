"use client";

import { readTicketCode } from "@makemyevent/core";
import { forwardRef, useEffect, useId, useState } from "react";
import { type DoorGuest, doorGuests } from "./actions";
import { clock } from "./door-time";
import styles from "./scanner.module.css";

const LOOKUP_MS = 250;
const SHOWN = 6;

/**
 * Type code: a ticket code, or part of a name. A whole code checks in on
 * Enter; anything else looks guests up as it's typed, and one is picked.
 * Only names, tickets and codes are shown (the queue can see the screen).
 */
export const TypeCode = forwardRef<
	HTMLInputElement,
	{
		eventId: string;
		onCode: (code: string) => Promise<void>;
		onPick: (guest: DoorGuest) => Promise<void>;
	}
>(function TypeCode({ eventId, onCode, onPick }, inputRef) {
	const id = useId();
	const [text, setText] = useState("");
	const [found, setFound] = useState<DoorGuest[] | null>(null);
	const [busy, setBusy] = useState(false);
	const code = readTicketCode(text);
	const looking = text.trim().length >= 2 && !code;

	useEffect(() => {
		if (!looking) {
			setFound(null);
			return;
		}
		let gone = false;
		const timer = window.setTimeout(async () => {
			const page = await doorGuests(eventId, { query: text, filter: "all" });
			if (!gone) setFound(page ? page.guests.slice(0, SHOWN) : []);
		}, LOOKUP_MS);
		return () => {
			gone = true;
			window.clearTimeout(timer);
		};
	}, [eventId, text, looking]);

	async function run(work: () => Promise<void>) {
		setBusy(true);
		await work();
		setBusy(false);
		setText("");
		setFound(null);
	}

	return (
		<section className={styles.typePanel} aria-labelledby={`${id}l`}>
			<form
				className={styles.typeRow}
				onSubmit={(e) => {
					e.preventDefault();
					if (busy) return;
					if (code) void run(() => onCode(code));
					else if (found?.length === 1 && found[0])
						void run(() => onPick(found[0] as DoorGuest));
				}}
			>
				<label className={styles.typeLabel} htmlFor={`${id}i`} id={`${id}l`}>
					Ticket code or name
				</label>
				<div className={styles.typeInputRow}>
					<input
						ref={inputRef}
						id={`${id}i`}
						className={styles.typeInput}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setText("");
								setFound(null);
							}
						}}
						placeholder="MME-7K2Q-9F4B, or a name"
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						maxLength={80}
						aria-describedby={`${id}h`}
						aria-controls={found ? `${id}r` : undefined}
					/>
					<button
						type="submit"
						className={styles.primaryButton}
						disabled={busy || !code}
						aria-busy={busy || undefined}
					>
						{busy ? "Checking…" : "Check in"}
					</button>
				</div>
				<p className={styles.hint} id={`${id}h`}>
					A whole code checks in on Enter. Part of a name shows who matches.
				</p>
			</form>

			{found ? (
				<ul
					className={styles.matches}
					id={`${id}r`}
					aria-label="Matching guests"
				>
					{found.length === 0 ? (
						<li className={styles.noMatch}>No guest with a place matches.</li>
					) : (
						found.map((g) => (
							<li key={g.id}>
								<button
									type="button"
									className={styles.match}
									disabled={busy}
									onClick={() => void run(() => onPick(g))}
								>
									<span
										className={styles.dot}
										data-in={g.in ? true : undefined}
										aria-hidden="true"
									/>
									<span className={styles.matchText}>
										<span className={styles.matchName}>{g.name}</span>
										<span className={styles.meta}>
											{g.ticket}, {g.code}
										</span>
									</span>
									<span className={styles.meta}>
										{g.in
											? `In at ${clock(new Date(g.in.at).getTime())}`
											: "Check in"}
									</span>
								</button>
							</li>
						))
					)}
				</ul>
			) : null}
		</section>
	);
});
