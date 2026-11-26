"use client";

import {
	type FormField,
	GUEST_PAGE_SIZE,
	type GuestCursor,
	type GuestQuery,
	guestInitials,
	guestQueryString,
} from "@makemyevent/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import {
	CloseIcon,
	ColumnsIcon,
	DownloadIcon,
	EditIcon,
	FilterIcon,
	MailIcon,
	SearchIcon,
	TickIcon,
	UploadIcon,
} from "@/components/icons";
import glance from "../overview/glance.module.css";
import type { Tone } from "../overview/glance-data";
import { exactTime, timeAgo } from "../overview/time-ago";
import { checkInMany } from "./actions";
import { ImportPanel } from "./import-panel";
import { sendPasses } from "./passes";
import { GuestCards } from "./guest-cards";
import { type FormMode, GuestFormPanel } from "./guest-form-panel";
import { GuestPanel } from "./guest-panel";
import { columnsCookie } from "./columns-cookie";
import type { GuestColumn, GuestRow } from "./guests-data";
import styles from "./guests.module.css";

export type TicketOption = { id: string; name: string; tone: Tone };

const TONE_CLASS: Record<Tone, string | undefined> = {
	1: glance.tone1,
	2: glance.tone2,
	3: glance.tone3,
	4: glance.tone4,
	5: glance.tone5,
	rest: glance.toneRest,
};

const count = new Intl.NumberFormat("en-US");

/**
 * Which questions are columns, per event, in this browser: kept in a
 * cookie, so the server draws the same columns and nothing shifts on load.
 */
function useColumns(eventId: string, initial: string[]) {
	const [shown, setShown] = useState(initial);
	const set = (next: string[]) => {
		setShown(next);
		// biome-ignore lint/suspicious/noDocumentCookie: a non-sensitive view preference the server reads to draw the same columns
		document.cookie = `${columnsCookie(eventId)}=${next.join(".")}; path=/dashboard; max-age=31536000; samesite=lax`;
	};
	return [shown, set] as const;
}

/**
 * The Guests list: search, filters and the page live in the address;
 * columns for form questions are this browser's choice. Each guest opens in
 * a panel. Select turns on checkboxes to check many in at once.
 */
export function GuestsList({
	eventId,
	query,
	form,
	invited,
	blocked,
	canManage,
	twoStepHref,
	blocklistHref,
	emailReady,
	rows,
	total,
	next,
	tickets,
	columns,
	initialColumns,
	timeZone,
	now,
}: {
	eventId: string;
	query: GuestQuery;
	/** The registration form, for Invite guest and Edit submission. */
	form: FormField[];
	invited: number;
	blocked: number;
	/** Owner, admin or organizer: invites, edits, cancels. Volunteers check in. */
	canManage: boolean;
	/**
	 * Set while the owner of a private draft has no second step: inviting
	 * or importing a guest goes there first, and comes back.
	 */
	twoStepHref: string | null;
	blocklistHref: string;
	/** Email and pass signing are set up. */
	emailReady: boolean;
	rows: GuestRow[];
	total: number;
	next: GuestCursor | null;
	tickets: TicketOption[];
	columns: GuestColumn[];
	/** The columns this browser chose, from its cookie. */
	initialColumns: string[];
	timeZone: string | null;
	now: Date;
}) {
	const id = useId();
	const router = useRouter();
	const pathname = usePathname();
	const [navigating, startNavigation] = useTransition();
	const [acting, startAction] = useTransition();
	const [shownColumns, setShownColumns] = useColumns(eventId, initialColumns);
	const visibleColumns = columns.filter((c) => shownColumns.includes(c.id));
	const [panel, setPanel] = useState<"filter" | "columns" | null>(null);
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [openId, setOpenId] = useState<string | null>(null);
	const [formMode, setFormMode] = useState<FormMode>(null);
	// Bulk upload, and where it was opened from: from Invite, Back returns there.
	const [importing, setImporting] = useState<"list" | "invite" | null>(null);
	const [message, setMessage] = useState<{
		tone: "ok" | "error";
		text: string;
	} | null>(null);
	const ticketById = useMemo(
		() => new Map(tickets.map((t) => [t.id, t])),
		[tickets],
	);
	// One ticket: every guest holds it, so the column would say nothing.
	const showTicket = tickets.length > 1;
	const filtered =
		query.q !== "" ||
		query.ticket !== null ||
		query.checked !== "all" ||
		query.source !== "all" ||
		query.cancelled;

	const go = useCallback(
		(next: Partial<GuestQuery>) => {
			const merged = { ...query, after: null, ...next };
			startNavigation(() => {
				router.replace(`${pathname}${guestQueryString(merged)}`, {
					scroll: false,
				});
			});
		},
		[query, pathname, router],
	);

	// Search as they type, a moment after they stop.
	const [text, setText] = useState(query.q);
	const latest = useRef(query.q);
	useEffect(() => {
		latest.current = query.q;
		setText(query.q);
	}, [query.q]);
	useEffect(() => {
		if (text.trim() === latest.current) return;
		const timer = setTimeout(() => go({ q: text.trim() }), 300);
		return () => clearTimeout(timer);
	}, [text, go]);

	// A new page or search clears the selection: it was of other rows.
	// biome-ignore lint/correctness/useExhaustiveDependencies: on new rows only
	useEffect(() => {
		setSelected(new Set());
	}, [rows]);

	function toggle(rowId: string) {
		setSelected((current) => {
			const nextSet = new Set(current);
			if (nextSet.has(rowId)) nextSet.delete(rowId);
			else nextSet.add(rowId);
			return nextSet;
		});
	}

	const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
	const start = query.after ? null : 1;

	function checkInSelected() {
		const ids = [...selected];
		startAction(async () => {
			const result = await checkInMany(eventId, ids);
			if (result.ok) {
				setMessage({
					tone: "ok",
					text: `Checked in ${ids.length} ${ids.length === 1 ? "guest" : "guests"}.`,
				});
				setSelected(new Set());
				router.refresh();
			} else setMessage({ tone: "error", text: result.message });
		});
	}

	return (
		<>
			<GuestCards
				invited={invited}
				blocked={blocked}
				canManage={canManage}
				onInvite={() =>
					twoStepHref
						? router.push(twoStepHref)
						: setFormMode({ kind: "invite" })
				}
				blocklistHref={blocklistHref}
			/>
			<section className={styles.list} aria-labelledby={`${id}title`}>
				<header className={styles.listHead}>
					{/* How many, and how many are in, is the Glance's to say. */}
					<h3 className={styles.listTitle} id={`${id}title`}>
						Guests
					</h3>

					{/* biome-ignore lint/a11y/useSemanticElements: <search> is not yet in React's element types; the role gives the same landmark */}
					<form
						role="search"
						className={styles.search}
						onSubmit={(event) => {
							event.preventDefault();
							go({ q: text.trim() });
						}}
					>
						<label className={styles.srOnly} htmlFor={`${id}q`}>
							Search guests
						</label>
						<SearchIcon className={styles.searchIcon} />
						<input
							id={`${id}q`}
							className={styles.searchInput}
							type="search"
							placeholder="Name, email or ticket code"
							autoComplete="off"
							value={text}
							onChange={(event) => setText(event.target.value)}
						/>
					</form>

					<div className={styles.tools}>
						<button
							type="button"
							className={styles.tool}
							aria-expanded={panel === "filter"}
							aria-controls={`${id}panel`}
							data-active={filtered && query.q === "" ? true : undefined}
							onClick={() => setPanel(panel === "filter" ? null : "filter")}
						>
							<FilterIcon /> Filter
						</button>
						<button
							type="button"
							className={styles.tool}
							aria-expanded={panel === "columns"}
							aria-controls={`${id}panel`}
							disabled={columns.length === 0}
							title={
								columns.length === 0
									? "Add questions in Form Builder to show them here"
									: undefined
							}
							onClick={() => setPanel(panel === "columns" ? null : "columns")}
						>
							<ColumnsIcon /> Columns
						</button>
						<button
							type="button"
							className={styles.tool}
							aria-pressed={selecting}
							disabled={rows.length === 0}
							onClick={() => {
								setSelecting(!selecting);
								setSelected(new Set());
							}}
						>
							<TickIcon /> Select
						</button>
						{canManage ? (
							<>
								<button
									type="button"
									className={`${styles.tool} ${styles.toolIcon}`}
									onClick={() =>
										twoStepHref
											? router.push(twoStepHref)
											: setImporting("list")
									}
								>
									<UploadIcon />
									<span className={styles.tip}>Bulk upload guests</span>
								</button>
								<a
									className={`${styles.tool} ${styles.toolIcon}`}
									href={`${pathname}/export${guestQueryString({ ...query, after: null })}`}
									download
								>
									<DownloadIcon />
									<span className={styles.tip}>
										{filtered
											? "Download these guests as CSV"
											: "Download every guest as CSV"}
									</span>
								</a>
							</>
						) : null}
					</div>
				</header>

				<div id={`${id}panel`}>
					{panel === "filter" ? (
						<div className={styles.drawer}>
							{showTicket ? (
								<FilterField label="Ticket">
									<select
										className={styles.select}
										value={query.ticket ?? ""}
										onChange={(event) =>
											go({ ticket: event.target.value || null })
										}
									>
										<option value="">Every ticket</option>
										{tickets.map((ticket) => (
											<option key={ticket.id} value={ticket.id}>
												{ticket.name}
											</option>
										))}
									</select>
								</FilterField>
							) : null}
							<FilterField label="Check-in">
								<select
									className={styles.select}
									value={query.checked}
									onChange={(event) =>
										go({ checked: event.target.value as GuestQuery["checked"] })
									}
								>
									<option value="all">Everyone</option>
									<option value="in">Checked in</option>
									<option value="out">Not checked in</option>
								</select>
							</FilterField>
							<FilterField label="Joined by">
								<select
									className={styles.select}
									value={query.source}
									onChange={(event) =>
										go({ source: event.target.value as GuestQuery["source"] })
									}
								>
									<option value="all">Any way</option>
									<option value="self">Registering</option>
									<option value="invite">Invite</option>
									<option value="bulk">Import</option>
								</select>
							</FilterField>
							<label className={styles.check}>
								<input
									type="checkbox"
									checked={query.cancelled}
									onChange={(event) => go({ cancelled: event.target.checked })}
								/>
								Show cancelled guests instead
							</label>
						</div>
					) : panel === "columns" ? (
						<fieldset className={styles.drawer}>
							<legend className={styles.drawerLegend}>Show answers to</legend>
							{columns.map((column) => (
								<label key={column.id} className={styles.check}>
									<input
										type="checkbox"
										checked={shownColumns.includes(column.id)}
										onChange={(event) =>
											setShownColumns(
												event.target.checked
													? [...shownColumns, column.id]
													: shownColumns.filter((c) => c !== column.id),
											)
										}
									/>
									{column.label}
								</label>
							))}
						</fieldset>
					) : null}
				</div>

				{filtered ? (
					<div className={styles.chips}>
						{query.q ? (
							<FilterChip
								label={`“${query.q}”`}
								onClear={() => go({ q: "" })}
							/>
						) : null}
						{query.ticket ? (
							<FilterChip
								label={ticketById.get(query.ticket)?.name ?? "A ticket"}
								onClear={() => go({ ticket: null })}
							/>
						) : null}
						{query.checked !== "all" ? (
							<FilterChip
								label={query.checked === "in" ? "Checked in" : "Not checked in"}
								onClear={() => go({ checked: "all" })}
							/>
						) : null}
						{query.source !== "all" ? (
							<FilterChip
								label={
									{ self: "Registered", invite: "Invited", bulk: "Imported" }[
										query.source
									]
								}
								onClear={() => go({ source: "all" })}
							/>
						) : null}
						{query.cancelled ? (
							<FilterChip
								label="Cancelled"
								onClear={() => go({ cancelled: false })}
							/>
						) : null}
						<button
							type="button"
							className={styles.clearAll}
							onClick={() =>
								go({
									q: "",
									ticket: null,
									checked: "all",
									source: "all",
									cancelled: false,
								})
							}
						>
							Clear all
						</button>
					</div>
				) : null}

				{selecting && selected.size > 0 ? (
					<section className={styles.bulkBar} aria-label="Selected guests">
						<p className={styles.bulkCount}>{selected.size} selected</p>
						<button
							type="button"
							className={styles.primary}
							disabled={acting}
							aria-busy={acting || undefined}
							onClick={checkInSelected}
						>
							{acting ? "Checking in…" : `Check in ${selected.size}`}
						</button>
						<button
							type="button"
							className={styles.secondary}
							onClick={() => setSelected(new Set())}
						>
							Clear
						</button>
					</section>
				) : null}

				<p className={styles.srOnly} role="status">
					{navigating ? "Loading guests" : (message?.text ?? "")}
				</p>
				{message ? (
					<p className={styles.message} data-tone={message.tone}>
						{message.text}
						<button
							type="button"
							className={styles.messageClose}
							onClick={() => setMessage(null)}
						>
							<CloseIcon />
							<span className={styles.srOnly}>Dismiss</span>
						</button>
					</p>
				) : null}

				{rows.length === 0 ? (
					<div className={styles.empty}>
						{filtered ? (
							<>
								<p className={styles.emptyTitle}>No guests match</p>
								<p className={styles.emptyBody}>
									Search looks at names, emails and ticket codes.
								</p>
								<button
									type="button"
									className={styles.secondary}
									onClick={() =>
										go({
											q: "",
											ticket: null,
											checked: "all",
											source: "all",
											cancelled: false,
										})
									}
								>
									Clear search and filters
								</button>
							</>
						) : (
							<>
								<p className={styles.emptyTitle}>No guests yet</p>
								<p className={styles.emptyBody}>
									Everyone who registers appears here, newest first, ready to
									check in.
								</p>
							</>
						)}
					</div>
				) : (
					<div className={styles.tableWrap} aria-busy={navigating || undefined}>
						<table className={styles.table}>
							<thead>
								<tr>
									{selecting ? (
										<th scope="col" className={styles.pickCell}>
											<input
												type="checkbox"
												aria-label="Select every guest on this page"
												checked={allOnPage}
												onChange={(event) =>
													setSelected(
														event.target.checked
															? new Set(rows.map((r) => r.id))
															: new Set(),
													)
												}
											/>
										</th>
									) : null}
									<th scope="col">Guest</th>
									{showTicket ? <th scope="col">Ticket</th> : null}
									<th scope="col">Status</th>
									{visibleColumns.map((column) => (
										<th
											key={column.id}
											scope="col"
											className={styles.answerHead}
										>
											{column.label}
										</th>
									))}
									<th scope="col">Registered</th>
									{canManage ? (
										<th scope="col" className={styles.actionsHead}>
											Actions
										</th>
									) : null}
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => {
									const ticket = ticketById.get(row.ticketTypeId);
									return (
										<tr
											key={row.id}
											className={styles.row}
											data-selected={selected.has(row.id) || undefined}
											data-open={openId === row.id || undefined}
											onClick={(event) => {
												// Its own controls do their own thing, and selecting
												// text to copy isn't a press.
												if (
													event.target instanceof Element &&
													event.target.closest("button, a, input, label")
												)
													return;
												if (window.getSelection()?.toString()) return;
												if (selecting) toggle(row.id);
												else setOpenId(row.id);
											}}
										>
											{selecting ? (
												<td className={styles.pickCell}>
													<input
														type="checkbox"
														aria-label={`Select ${row.name}`}
														checked={selected.has(row.id)}
														onChange={() => toggle(row.id)}
													/>
												</td>
											) : null}
											<td className={styles.guestTd}>
												<div className={styles.guestCell}>
													<span className={styles.avatar} aria-hidden="true">
														{guestInitials(row.name)}
													</span>
													<span className={styles.who}>
														<button
															type="button"
															className={styles.name}
															onClick={() => setOpenId(row.id)}
														>
															{row.name}
														</button>
														<span className={styles.email}>{row.email}</span>
													</span>
												</div>
											</td>
											{showTicket ? (
												<td data-label="Ticket">
													<span className={styles.ticket}>
														<span
															className={`${glance.dot} ${TONE_CLASS[ticket?.tone ?? "rest"]}`}
															aria-hidden="true"
														/>
														{ticket?.name ?? "Ticket"}
													</span>
												</td>
											) : null}
											<td data-label="Status">
												<span className={styles.statuses}>
													{row.checkedInAt ? (
														<StatusMark tone="in" label="Checked in">
															<TickIcon />
														</StatusMark>
													) : (
														<StatusMark tone="out" label="Not checked in" />
													)}
													{row.status === "waitlisted" ? (
														<StatusMark tone="wait" label="On the waitlist" />
													) : null}
													{row.source === "invite" ? (
														<StatusMark label="Invited by the team">
															<MailIcon />
														</StatusMark>
													) : row.source === "bulk" ? (
														<StatusMark label="Added by bulk upload">
															<UploadIcon />
														</StatusMark>
													) : null}
												</span>
											</td>
											{visibleColumns.map((column) => (
												<td
													key={column.id}
													data-label={column.label}
													className={styles.answerCell}
												>
													{row.answers[column.id] ?? (
														<span className={styles.none}>
															<span aria-hidden="true">—</span>
															<span className={styles.srOnly}>No answer</span>
														</span>
													)}
												</td>
											))}
											<td data-label="Registered">
												<time
													className={styles.when}
													dateTime={row.registeredAt.toISOString()}
													title={exactTime(row.registeredAt, timeZone)}
												>
													{timeAgo(row.registeredAt, now, timeZone)}
												</time>
											</td>
											{canManage ? (
												<td className={styles.actionsCell}>
													<button
														type="button"
														className={`${styles.iconButton} ${styles.tipHost}`}
														onClick={() =>
															setFormMode({ kind: "edit", id: row.id })
														}
													>
														<EditIcon />
														<span className={styles.tip}>
															Edit {row.name}'s submission
														</span>
													</button>
												</td>
											) : null}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}

				{rows.length > 0 ? (
					<footer className={styles.listFoot}>
						<p className={styles.range}>
							{start
								? `${count.format(start)}–${count.format(rows.length)} of ${count.format(total)}`
								: `${count.format(rows.length)} more of ${count.format(total)}`}
						</p>
						<nav className={styles.pager} aria-label="Pages">
							{query.after ? (
								<Link
									className={styles.secondary}
									href={`${pathname}${guestQueryString({ ...query, after: null })}`}
									scroll={false}
								>
									Newest
								</Link>
							) : null}
							{next ? (
								<Link
									className={styles.secondary}
									href={`${pathname}${guestQueryString({ ...query, after: next })}`}
									scroll={false}
								>
									Next {GUEST_PAGE_SIZE}
								</Link>
							) : null}
						</nav>
					</footer>
				) : null}

				<GuestPanel
					eventId={eventId}
					openId={openId}
					order={rows.map((r) => r.id)}
					timeZone={timeZone}
					canManage={canManage}
					onOpen={setOpenId}
					onEdit={(id) => setFormMode({ kind: "edit", id })}
					onChanged={() => router.refresh()}
				/>
			</section>
			<GuestFormPanel
				eventId={eventId}
				mode={formMode}
				fields={form}
				tickets={tickets}
				onClose={() => setFormMode(null)}
				emailReady={emailReady}
				onSaved={(id, emailPass) => {
					setFormMode(null);
					router.refresh();
					setOpenId(id);
					if (emailPass)
						void sendPasses(eventId, [id]).then((result) => {
							setMessage(
								!result.ok
									? {
											tone: "error",
											text: `Added, but the pass wasn't emailed: ${result.message}`,
										}
									: result.sent > 0
										? {
												tone: "ok",
												text: "Added, and their pass is on its way.",
											}
										: {
												tone: "error",
												text: `Added, but the pass wasn't emailed: ${result.failed[0]?.reason ?? result.skipped[0]?.reason ?? "unknown"}`,
											},
							);
						});
				}}
				onOpenGuest={(id) => {
					setFormMode(null);
					setOpenId(id);
				}}
				onImport={() => setImporting("invite")}
			/>
			<ImportPanel
				eventId={eventId}
				open={importing !== null}
				fields={form}
				tickets={tickets}
				emailReady={emailReady}
				onClose={() => setImporting(null)}
				onBack={
					importing === "invite"
						? () => setFormMode({ kind: "invite" })
						: undefined
				}
				onDone={(summary) => {
					setImporting(null);
					setMessage({ tone: "ok", text: summary });
					router.refresh();
				}}
			/>
		</>
	);
}

/** A filter: the select inside the label, so it is named by it. */
function FilterField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: the select comes in as children, inside the label, which names it
		<label className={styles.filterField}>
			<span className={styles.filterLabel}>{label}</span>
			{children}
		</label>
	);
}

function FilterChip({
	label,
	onClear,
}: {
	label: string;
	onClear: () => void;
}) {
	return (
		<span className={styles.chip}>
			{label}
			<button type="button" className={styles.chipClear} onClick={onClear}>
				<CloseIcon />
				<span className={styles.srOnly}>Remove {label}</span>
			</button>
		</span>
	);
}

/**
 * One small mark in the Status column, its words in a tooltip and for
 * screen readers. Tone tells them apart at a glance; the shape (a tick, a
 * ring, an envelope) says it without colour.
 */
function StatusMark({
	tone,
	label,
	children,
}: {
	tone?: "in" | "out" | "wait";
	label: string;
	children?: React.ReactNode;
}) {
	return (
		<span className={styles.mark} data-tone={tone}>
			{children}
			<span className={styles.tip}>{label}</span>
		</span>
	);
}
