"use client";

import {
	detectKind,
	isSingleKind,
	LINK_KINDS,
	LINK_LIMIT,
	type LinkKind,
	normalizeLink,
	PLATFORMS,
	shortLink,
} from "@makemyevent/core";
import { useEffect, useId, useRef, useState } from "react";
import { LinkKindIcon } from "./link-icons";
import base from "./schedule-venue.module.css";
import styles from "./social-links.module.css";

export type LinkRow = {
	/** A key for this row while editing; not stored. */
	id: string;
	kind: LinkKind;
	/** As the host typed it; turned into the address on save. */
	value: string;
};

/** Shown first; the rest behind "More". */
const COMMON: LinkKind[] = [
	"website",
	"instagram",
	"whatsapp",
	"x",
	"linkedin",
	"youtube",
	"email",
	"phone",
];
const MORE = LINK_KINDS.filter((kind) => !COMMON.includes(kind));

/** Under an empty row: what this platform takes. */
function emptyTip(kind: LinkKind): string {
	if (kind === "email") return "An email address";
	if (kind === "phone") return "With the country code";
	if (kind === "whatsapp")
		return "A number with its country code, or a group link";
	if (kind === "mastodon") return "Your full handle, or a link to your profile";
	return PLATFORMS[kind].handle
		? "A handle or a link to your profile"
		: "A web address";
}

let nextId = 0;
const newId = () => `n${++nextId}`;

/**
 * Social links: where guests follow or reach the host, at the foot of the
 * event page.
 *
 *   [◎ Paste a link, handle, email or number        ] [Add]
 *   Add  (Website) (Instagram) (WhatsApp) (X) … (More)
 *   ─────────────────────────────────────────────────────────
 *   1  ◎ Instagram  [@makemyevent        ]  ↑ ↓ ✕
 *                   Opens instagram.com/makemyevent
 *
 * A pasted link finds its own platform; a chip starts a row for one. Each
 * row says where it will take guests, so a slip shows before saving.
 */
export function SocialLinksCard({
	value,
	onChange,
	error,
}: {
	value: LinkRow[];
	onChange: (links: LinkRow[]) => void;
	/** From saving: which row, and what to fix. */
	error: { index: number | null; message: string } | null;
}) {
	const id = useId();
	const [paste, setPaste] = useState("");
	const [pasteNote, setPasteNote] = useState<string | null>(null);
	const [showMore, setShowMore] = useState(false);
	const [announce, setAnnounce] = useState("");
	const pasteRef = useRef<HTMLInputElement>(null);
	const inputs = useRef(new Map<string, HTMLInputElement>());
	const buttons = useRef(new Map<string, HTMLButtonElement>());
	// Focus to move once the list has rendered: a new row's field, or a
	// moved row's button.
	const [focusNext, setFocusNext] = useState<
		{ id: string; target: "input" | "up" | "down" } | { id: "paste" } | null
	>(null);

	useEffect(() => {
		if (!focusNext) return;
		if (focusNext.id === "paste") pasteRef.current?.focus();
		else if ("target" in focusNext) {
			if (focusNext.target === "input")
				inputs.current.get(focusNext.id)?.focus();
			else {
				const button = buttons.current.get(
					`${focusNext.id}:${focusNext.target}`,
				);
				// At the top or bottom that way is closed: the other way stays.
				if (button && !button.disabled) button.focus();
				else
					buttons.current
						.get(`${focusNext.id}:${focusNext.target === "up" ? "down" : "up"}`)
						?.focus();
			}
		}
		setFocusNext(null);
	}, [focusNext]);

	const full = value.length >= LINK_LIMIT;
	const existing = (kind: LinkKind) =>
		isSingleKind(kind) ? value.find((row) => row.kind === kind) : undefined;

	const add = (kind: LinkKind, text = "") => {
		const already = existing(kind);
		if (already) {
			// One of these per page: go to the one there is.
			setFocusNext({ id: already.id, target: "input" });
			setAnnounce(`${PLATFORMS[kind].label} is already in the list.`);
			return false;
		}
		if (full) return false;
		const row = { id: newId(), kind, value: text };
		onChange([...value, row]);
		setFocusNext({ id: row.id, target: "input" });
		setAnnounce(`${PLATFORMS[kind].label} added.`);
		return true;
	};

	const addPasted = () => {
		const text = paste.trim();
		if (!text) return;
		const kind = detectKind(text);
		if (!kind) {
			setPasteNote(
				"Not a link we recognise. For a handle like @name, pick its platform below.",
			);
			return;
		}
		if (add(kind, text)) {
			setPaste("");
			setPasteNote(null);
		}
	};

	const update = (rowId: string, text: string) =>
		onChange(
			value.map((row) => (row.id === rowId ? { ...row, value: text } : row)),
		);

	const move = (index: number, by: -1 | 1) => {
		const to = index + by;
		const row = value[index];
		const other = value[to];
		if (!row || !other) return;
		const next = [...value];
		next[index] = other;
		next[to] = row;
		onChange(next);
		setFocusNext({ id: row.id, target: by < 0 ? "up" : "down" });
		setAnnounce(
			`${PLATFORMS[row.kind].label} moved to ${to + 1} of ${value.length}.`,
		);
	};

	const remove = (index: number) => {
		const row = value[index];
		if (!row) return;
		const next = value.filter((_, i) => i !== index);
		onChange(next);
		const after = next[index] ?? next[index - 1];
		setFocusNext(after ? { id: after.id, target: "input" } : { id: "paste" });
		setAnnounce(`${PLATFORMS[row.kind].label} removed.`);
	};

	const detected = paste.trim() ? detectKind(paste) : null;

	return (
		<section
			className={`${base.panel} ${styles.panel}`}
			aria-labelledby={`${id}title`}
		>
			<header className={styles.head}>
				<div className={base.panelHead}>
					<h3 className={base.panelTitle} id={`${id}title`}>
						Social links
					</h3>
					<p className={base.panelLead}>
						At the foot of your event page, in this order
					</p>
				</div>
				<p className={styles.count} aria-hidden="true">
					{value.length} of {LINK_LIMIT}
				</p>
			</header>

			<div className={base.card}>
				{/* Paste anything: the platform is found from it. */}
				<div className={styles.paste}>
					<label className={base.label} htmlFor={`${id}paste`}>
						Add a link
					</label>
					<div className={styles.pasteRow}>
						<div className={styles.pasteBox}>
							<span className={styles.pasteIcon} aria-hidden="true">
								<LinkKindIcon kind={detected ?? "other"} />
							</span>
							<input
								ref={pasteRef}
								id={`${id}paste`}
								className={`${base.input} ${styles.pasteInput}`}
								value={paste}
								disabled={full}
								autoComplete="off"
								spellCheck={false}
								placeholder={
									full
										? `All ${LINK_LIMIT} places are used`
										: "Paste a link, email or phone number"
								}
								onChange={(event) => {
									setPaste(event.target.value);
									setPasteNote(null);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addPasted();
									}
								}}
								aria-describedby={`${id}pasteh`}
							/>
						</div>
						<button
							type="button"
							className={styles.addButton}
							onClick={addPasted}
							disabled={full || !paste.trim()}
						>
							Add
						</button>
					</div>
					<p className={base.hint} id={`${id}pasteh`} aria-live="polite">
						{pasteNote ? (
							<span className={base.error}>{pasteNote}</span>
						) : detected ? (
							`Adds as ${PLATFORMS[detected].label}`
						) : (
							"Its platform is found from the link"
						)}
					</p>
				</div>

				{/* Or start from a platform. */}
				<fieldset className={styles.platforms} disabled={full}>
					<legend className={base.label}>Or pick a platform</legend>
					<div className={styles.chips}>
						{[...COMMON, ...(showMore ? MORE : [])].map((kind) => {
							const there = existing(kind);
							return (
								<button
									key={kind}
									type="button"
									className={styles.chip}
									data-added={there ? "" : undefined}
									onClick={() => add(kind)}
									aria-label={
										there
											? `${PLATFORMS[kind].label}, added: go to it`
											: `Add ${PLATFORMS[kind].label}`
									}
								>
									<LinkKindIcon kind={kind} className={styles.chipIcon} />
									{PLATFORMS[kind].label}
								</button>
							);
						})}
						<button
							type="button"
							className={`${styles.chip} ${styles.more}`}
							aria-expanded={showMore}
							onClick={() => setShowMore((open) => !open)}
						>
							{showMore ? "Fewer" : `${MORE.length} more`}
						</button>
					</div>
				</fieldset>

				{value.length === 0 ? (
					<p className={styles.empty}>
						No links yet. Guests will see them under the event details, in the
						order you set here.
					</p>
				) : (
					<ol className={styles.list} aria-label="Your links">
						{value.map((row, index) => {
							const platform = PLATFORMS[row.kind];
							const result = row.value.trim()
								? normalizeLink(row.kind, row.value)
								: null;
							const saveError =
								error && error.index === index ? error.message : null;
							const problem =
								saveError ?? (result && !result.ok ? result.message : null);
							const inputId = `${id}row${row.id}`;
							return (
								<li key={row.id} className={styles.row}>
									<span className={styles.place} aria-hidden="true">
										{index + 1}
									</span>
									<label className={styles.platform} htmlFor={inputId}>
										<span className={styles.badge}>
											<LinkKindIcon kind={row.kind} />
										</span>
										{platform.label}
									</label>
									<div className={styles.value}>
										<input
											ref={(node) => {
												if (node) inputs.current.set(row.id, node);
												else inputs.current.delete(row.id);
											}}
											id={inputId}
											className={base.input}
											value={row.value}
											type={row.kind === "email" ? "email" : "text"}
											inputMode={
												row.kind === "phone" || row.kind === "whatsapp"
													? "tel"
													: row.kind === "email"
														? "email"
														: "url"
											}
											autoComplete="off"
											spellCheck={false}
											maxLength={2048}
											placeholder={platform.placeholder}
											onChange={(event) => update(row.id, event.target.value)}
											aria-invalid={problem ? true : undefined}
											aria-describedby={`${inputId}h`}
										/>
										<p className={base.hint} id={`${inputId}h`}>
											{problem ? (
												<span className={base.error}>{problem}</span>
											) : result?.ok ? (
												<>
													{row.kind === "email"
														? "Emails"
														: row.kind === "phone"
															? "Calls"
															: "Opens"}{" "}
													<span className={styles.target}>
														{shortLink(result.url)}
													</span>
													{row.kind === "email" || row.kind === "phone"
														? ". Anyone on the page can see it."
														: null}
												</>
											) : (
												emptyTip(row.kind)
											)}
										</p>
									</div>
									<div className={styles.tools}>
										<button
											type="button"
											className={styles.tool}
											ref={(node) => {
												if (node) buttons.current.set(`${row.id}:up`, node);
												else buttons.current.delete(`${row.id}:up`);
											}}
											onClick={() => move(index, -1)}
											disabled={index === 0}
											aria-label={`Move ${platform.label} up`}
											title="Move up"
										>
											<svg viewBox="0 0 16 16" aria-hidden="true">
												<path d="M8 12.5v-9M4 7.5l4-4 4 4" />
											</svg>
										</button>
										<button
											type="button"
											className={styles.tool}
											ref={(node) => {
												if (node) buttons.current.set(`${row.id}:down`, node);
												else buttons.current.delete(`${row.id}:down`);
											}}
											onClick={() => move(index, 1)}
											disabled={index === value.length - 1}
											aria-label={`Move ${platform.label} down`}
											title="Move down"
										>
											<svg viewBox="0 0 16 16" aria-hidden="true">
												<path d="M8 3.5v9M4 8.5l4 4 4-4" />
											</svg>
										</button>
										<button
											type="button"
											className={`${styles.tool} ${styles.remove}`}
											onClick={() => remove(index)}
											aria-label={`Remove ${platform.label}`}
											title="Remove"
										>
											<svg viewBox="0 0 16 16" aria-hidden="true">
												<path d="m4.5 4.5 7 7m0-7-7 7" />
											</svg>
										</button>
									</div>
								</li>
							);
						})}
					</ol>
				)}
				{error && error.index === null ? (
					<p className={base.hint}>
						<span className={base.error}>{error.message}</span>
					</p>
				) : null}
				<p className={styles.srOnly} aria-live="polite">
					{announce}
				</p>
			</div>
		</section>
	);
}
