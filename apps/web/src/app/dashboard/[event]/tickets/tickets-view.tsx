"use client";

import {
	TICKET_DESCRIPTION_MAX,
	TICKET_NAME_MAX,
	type TicketField,
	type TicketInput,
	ticketStatus,
} from "@makemyevent/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { EditIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { SaveBar, type SaveMessage } from "@/components/ui/save-bar";
import { useDraft } from "@/components/ui/use-draft";
import dialog from "../../create-event.module.css";
import { Popup } from "../../popup";
import { useUnsavedChanges } from "../unsaved-changes";
import {
	createTicket,
	deleteTicket,
	saveTicket,
	setTicketClosed,
} from "./actions";
import styles from "./tickets.module.css";

export type TicketRow = {
	id: string;
	name: string;
	description: string;
	capacity: number | null;
	maxPerPerson: number | null;
	inviteOnly: boolean;
	waitlist: boolean;
	closed: boolean;
	multiDay: boolean;
	transferable: boolean;
	registered: number;
	waiting: number;
	/** The days it admits; empty for every day. */
	days: string[];
};

/** What the pass preview prints besides the ticket's name. */
export type PassDetails = {
	eventTitle: string;
	/** When the event starts, in its own zone; null until a date is set. */
	start: { iso: string; date: string; time: string } | null;
};

const count = new Intl.NumberFormat("en-IN");

/** The five data colours, then the rest (design-spec.md), biggest first. */
const SERIES = [
	"var(--series-1)",
	"var(--series-2)",
	"var(--series-3)",
	"var(--series-4)",
	"var(--series-5)",
];
const seriesColour = (rank: number) => SERIES[rank] ?? "var(--series-rest)";

/** "Thu, 10 Dec" for a day chip. */
function dayLabel(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return new Intl.DateTimeFormat("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1)));
}

function inputOf(t: TicketRow): TicketInput {
	return {
		name: t.name,
		description: t.description,
		capped: t.capacity !== null,
		capacity: t.capacity === null ? "" : String(t.capacity),
		limitPerPerson: t.maxPerPerson !== null,
		maxPerPerson: t.maxPerPerson === null ? "" : String(t.maxPerPerson),
		inviteOnly: t.inviteOnly,
		multiDay: t.multiDay,
		days: t.days,
		transferable: t.transferable,
		waitlist: t.waitlist,
	};
}

const sameInput = (a: TicketInput, b: TicketInput) =>
	JSON.stringify(a) === JSON.stringify(b);

const STATUS_LABEL = {
	on_sale: "On sale",
	sold_out: "Sold out",
	closed: "Closed",
} as const;

/**
 * The Tickets section: the places at a glance, every ticket, and the one
 * chosen open beside them to edit.
 *
 *   [ Registered 12 of 250 ▬▬ | Checked in 3 today | Tickets 2 1 on sale ]
 *   ┌ Your tickets  [+ New] ┐ ┌ General · On sale       [Close sales] ┐
 *   │ General        On sale│ │ ┌ pass preview ────────────┊ QR ┐     │
 *   │ 12 of 50          24% │ │ └──────────────────────────┊────┘     │
 *   │ ▬▬▬▬───────────────── │ │ Name, what it includes                │
 *   └───────────────────────┘ │ ┌ Rules: one switch a row ──────────┐ │
 *                             └────────────────────────────────────────┘
 */
export function TicketsView({
	eventId,
	eventCapacity,
	eventDays,
	checkedIn,
	checkedInToday,
	capacityHref,
	pass,
	tickets,
}: {
	eventId: string;
	eventCapacity: number | null;
	eventDays: string[];
	checkedIn: number;
	checkedInToday: boolean;
	capacityHref: string;
	pass: PassDetails;
	tickets: TicketRow[];
}) {
	const router = useRouter();
	const [selectedId, setSelectedId] = useState(tickets[0]?.id ?? null);
	const [notice, setNotice] = useState<string | null>(null);
	const [creating, startCreate] = useTransition();
	const editorRef = useRef<HTMLElement>(null);
	const dirtyRef = useRef(false);
	// A ticket just added, still on its way in the next refresh.
	const arriving = useRef<string | null>(null);

	const registered = tickets.reduce((sum, t) => sum + t.registered, 0);
	const event = { capacity: eventCapacity, registered };
	// Ticket limits sit inside the event's, and may add up to more: the
	// event's limit still stops everyone. Said when it happens.
	const ownLimits = tickets.reduce((sum, t) => sum + (t.capacity ?? 0), 0);
	const overlap = eventCapacity !== null && ownLimits > eventCapacity;
	const eventLeft =
		eventCapacity === null ? null : Math.max(0, eventCapacity - registered);
	const statuses = tickets.map((t) =>
		ticketStatus(
			{
				closedAt: t.closed ? "closed" : null,
				capacity: t.capacity,
				registered: t.registered,
			},
			event,
		),
	);
	const selected =
		tickets.find((t) => t.id === selectedId) ??
		(selectedId !== null && selectedId === arriving.current
			? null
			: (tickets[0] ?? null));

	// A ticket deleted, here or elsewhere: the first one opens instead. One
	// just added is waited for until the list has it.
	useEffect(() => {
		if (!selectedId || tickets.some((t) => t.id === selectedId)) {
			if (selectedId === arriving.current) arriving.current = null;
			return;
		}
		if (selectedId !== arriving.current) setSelectedId(tickets[0]?.id ?? null);
	}, [tickets, selectedId]);

	function choose(id: string) {
		if (id === selected?.id) return;
		if (dirtyRef.current) {
			setNotice(
				`Save or discard the changes to ${selected?.name ?? "this ticket"} first.`,
			);
			return;
		}
		setNotice(null);
		setSelectedId(id);
		// On a phone the editor is below the list: bring it into view.
		if (window.matchMedia("(max-width: 1023px)").matches)
			requestAnimationFrame(() =>
				editorRef.current?.scrollIntoView({ block: "start" }),
			);
	}

	function create() {
		if (dirtyRef.current) {
			setNotice(
				`Save or discard the changes to ${selected?.name ?? "this ticket"} first.`,
			);
			return;
		}
		startCreate(async () => {
			const result = await createTicket(eventId);
			if (!result.ok) {
				setNotice(result.message);
				return;
			}
			setNotice(null);
			arriving.current = result.id;
			setSelectedId(result.id);
			router.refresh();
		});
	}

	// Each ticket's data colour: biggest seller first, ties in list order.
	const rank = new Map(
		[...tickets]
			.map((t, i) => ({ id: t.id, registered: t.registered, i }))
			.sort((a, b) => b.registered - a.registered || a.i - b.i)
			.map((t, r) => [t.id, r]),
	);

	const onSale = statuses.filter((s) => s === "on_sale").length;
	const soldOut = statuses.filter((s) => s === "sold_out").length;
	const closed = statuses.filter((s) => s === "closed").length;

	return (
		<div className={styles.page}>
			<section className={styles.summary} aria-label="Tickets at a glance">
				<div className={styles.stat}>
					<div className={styles.statTop}>
						<p className={styles.statLabel}>Registered</p>
						<Link className={styles.statLink} href={capacityHref}>
							Change limit
						</Link>
					</div>
					<p className={styles.statValue}>
						{count.format(registered)}
						<span className={styles.statOf}>
							{eventCapacity === null
								? "no limit"
								: `of ${count.format(eventCapacity)}`}
						</span>
					</p>
					{eventCapacity !== null ? (
						// The count above says it in words; the bar only shows it.
						<div className={styles.meter} aria-hidden="true">
							<span
								style={{
									width: `${Math.min(100, (registered / eventCapacity) * 100)}%`,
								}}
							/>
						</div>
					) : null}
				</div>
				<div className={styles.stat}>
					<p className={styles.statLabel}>Checked in</p>
					<p className={styles.statValue}>
						{count.format(checkedIn)}
						<span className={styles.statOf}>
							{checkedInToday ? "today" : "so far"}
						</span>
					</p>
				</div>
				<div className={styles.stat}>
					<p className={styles.statLabel}>Tickets</p>
					<p className={styles.statValue}>
						{tickets.length}
						<span className={styles.statOf}>
							{[
								onSale ? `${onSale} on sale` : null,
								soldOut ? `${soldOut} sold out` : null,
								closed ? `${closed} closed` : null,
							]
								.filter(Boolean)
								.join(", ")}
						</span>
					</p>
				</div>
			</section>

			<div className={styles.columns}>
				<section className={styles.list} aria-labelledby="ticket-list-title">
					<header className={styles.listHead}>
						<h3 className={styles.listTitle} id="ticket-list-title">
							Your tickets
						</h3>
						<button
							type="button"
							className={styles.newButton}
							onClick={create}
							disabled={creating}
							aria-busy={creating || undefined}
						>
							<PlusIcon />
							{creating ? "Adding…" : "New ticket"}
						</button>
					</header>
					{overlap && eventCapacity !== null ? (
						<p className={styles.listHint}>
							Ticket limits add up to {count.format(ownLimits)}. The event stops
							at {count.format(eventCapacity)}.
						</p>
					) : null}
					<p className={styles.notice} role="status">
						{notice}
					</p>
					<ul className={styles.items}>
						{tickets.map((ticket, i) => {
							const status = statuses[i] ?? "on_sale";
							// Its own places, else the event's it shares; none, no bar.
							const limit = ticket.capacity ?? eventCapacity;
							const share =
								limit === null || limit === 0
									? null
									: Math.min(1, ticket.registered / limit);
							return (
								<li key={ticket.id}>
									<button
										type="button"
										className={styles.item}
										aria-current={ticket.id === selected?.id || undefined}
										onClick={() => choose(ticket.id)}
									>
										<span className={styles.itemTop}>
											<span className={styles.itemName}>{ticket.name}</span>
											<span className={styles.chip} data-status={status}>
												{STATUS_LABEL[status]}
											</span>
										</span>
										<span className={styles.itemSales}>
											<span className={styles.itemMeta}>
												{count.format(ticket.registered)}
												{ticket.capacity !== null
													? ` of ${count.format(ticket.capacity)}`
													: limit !== null
														? ` of ${count.format(limit)} (shared)`
														: " registered"}
											</span>
											{share !== null ? (
												<span className={styles.itemMeta}>
													{Math.round(share * 100)}%
												</span>
											) : null}
										</span>
										{share !== null ? (
											// The numbers above say it in words; the bar only shows it.
											<span className={styles.itemBar} aria-hidden="true">
												<span
													style={{
														width: `${share * 100}%`,
														background: seriesColour(rank.get(ticket.id) ?? 0),
													}}
												/>
											</span>
										) : null}
										{ticket.capacity !== null &&
										eventLeft !== null &&
										status === "on_sale" &&
										ticket.capacity - ticket.registered > eventLeft ? (
											// Its own limit has more room than the event has left.
											<span className={styles.itemMeta}>
												{count.format(eventLeft)} left at the event
											</span>
										) : null}
										{ticket.waiting > 0 ? (
											<span className={styles.itemMeta}>
												{count.format(ticket.waiting)} waiting
											</span>
										) : null}
										<span className={styles.tags}>
											<span className={styles.tag}>Free</span>
											{ticket.inviteOnly ? (
												<span className={styles.tag}>Invite only</span>
											) : null}
											{ticket.waitlist ? (
												<span className={styles.tag}>Waiting list</span>
											) : null}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</section>

				<section
					className={styles.editorColumn}
					ref={editorRef}
					aria-label="Edit ticket"
				>
					{selected ? (
						<TicketEditor
							key={selected.id}
							eventId={eventId}
							ticket={selected}
							status={statuses[tickets.indexOf(selected)] ?? "on_sale"}
							eventCapacity={eventCapacity}
							eventDays={eventDays}
							pass={pass}
							onDirty={(dirty) => {
								dirtyRef.current = dirty;
								if (!dirty) setNotice(null);
							}}
							onDeleted={() => {
								dirtyRef.current = false;
								setSelectedId(null);
								router.refresh();
							}}
						/>
					) : null}
				</section>
			</div>
		</div>
	);
}

function TicketEditor({
	eventId,
	ticket,
	status,
	eventCapacity,
	eventDays,
	pass,
	onDirty,
	onDeleted,
}: {
	eventId: string;
	ticket: TicketRow;
	status: keyof typeof STATUS_LABEL;
	eventCapacity: number | null;
	eventDays: string[];
	pass: PassDetails;
	onDirty: (dirty: boolean) => void;
	onDeleted: () => void;
}) {
	const id = useId();
	const router = useRouter();
	// One object per version of the ticket from the server: a new one on
	// every render would make the draft take it again, render after render.
	const server = useMemo(() => inputOf(ticket), [ticket]);
	const { saved, setSaved, draft, setDraft, dirty } = useDraft(
		server,
		sameInput,
	);
	const [error, setError] = useState<{
		field: TicketField | null;
		message: string;
	} | null>(null);
	const [message, setMessage] = useState<SaveMessage>({
		tone: "plain",
		text: "",
	});
	const [pending, startTransition] = useTransition();
	const [closing, startClosing] = useTransition();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [deleting, startDelete] = useTransition();

	// Told when it changes, not on every render.
	const tell = useRef(onDirty);
	tell.current = onDirty;
	useEffect(() => tell.current(dirty), [dirty]);

	const set = (next: Partial<TicketInput>) => {
		setDraft((current) => ({ ...current, ...next }));
		setError(null);
		setMessage({ tone: "plain", text: "" });
	};

	async function save(): Promise<boolean> {
		const result = await saveTicket(eventId, ticket.id, draft);
		if (!result.ok) {
			setError({ field: result.field, message: result.message });
			setMessage({ tone: "error", text: result.message });
			requestAnimationFrame(() =>
				document
					.querySelector<HTMLElement>(
						`[data-editor="${id}"] [aria-invalid="true"]`,
					)
					?.focus(),
			);
			return false;
		}
		setSaved(draft);
		setError(null);
		setMessage({ tone: "saved" });
		router.refresh();
		return true;
	}
	useUnsavedChanges(dirty, save);

	const invalid = (field: TicketField) =>
		error?.field === field ? true : undefined;
	const fieldError = (field: TicketField) =>
		error?.field === field ? (
			<p className={styles.fieldError} id={`${id}${field}e`}>
				{error.message}
			</p>
		) : null;
	const describe = (field: TicketField, hint?: string) =>
		[error?.field === field ? `${id}${field}e` : "", hint ?? ""]
			.filter(Boolean)
			.join(" ") || undefined;

	const multiDayEvent = eventDays.length > 1;
	const placeLimit = eventCapacity;

	return (
		<div className={styles.editor} data-editor={id}>
			<header className={styles.editorHead}>
				<div className={styles.editorTitleRow}>
					<h3 className={styles.editorTitle}>{saved.name || "Untitled"}</h3>
					<span className={styles.chip} data-status={status}>
						{STATUS_LABEL[status]}
					</span>
				</div>
				<button
					type="button"
					className={styles.secondary}
					disabled={closing}
					aria-busy={closing || undefined}
					onClick={() =>
						startClosing(async () => {
							const result = await setTicketClosed(
								eventId,
								ticket.id,
								!ticket.closed,
							);
							if (!result.ok)
								setMessage({ tone: "error", text: result.message });
							else router.refresh();
						})
					}
				>
					{ticket.closed ? "Reopen sales" : "Close sales"}
				</button>
			</header>

			<TicketPass name={draft.name.trim() || "Untitled"} pass={pass} />

			<div className={styles.group}>
				<div className={styles.field}>
					<label className={styles.label} htmlFor={`${id}name`}>
						Name
					</label>
					<input
						id={`${id}name`}
						className={styles.input}
						value={draft.name}
						maxLength={TICKET_NAME_MAX}
						autoComplete="off"
						onChange={(e) => set({ name: e.target.value })}
						aria-invalid={invalid("name")}
						aria-describedby={describe("name")}
					/>
					{fieldError("name")}
				</div>
				<div className={styles.field}>
					<label className={styles.label} htmlFor={`${id}desc`}>
						What it includes
						<span className={styles.optional}> (optional)</span>
					</label>
					<textarea
						id={`${id}desc`}
						className={`${styles.input} ${styles.textarea}`}
						rows={3}
						value={draft.description}
						maxLength={TICKET_DESCRIPTION_MAX}
						placeholder="Sessions, workshops and lunch"
						onChange={(e) => set({ description: e.target.value })}
						aria-invalid={invalid("description")}
						aria-describedby={describe("description", `${id}descCount`)}
					/>
					<p className={styles.hint} id={`${id}descCount`}>
						{draft.description.length} of {TICKET_DESCRIPTION_MAX}
					</p>
					{fieldError("description")}
				</div>
			</div>

			<div className={styles.group}>
				<fieldset className={styles.rules}>
					<legend className={styles.srOnly}>Rules</legend>
					<SwitchRow
						label="Paid"
						hint="soon"
						description="Free for now. Paid tickets come with payments."
						checked={false}
						disabled
						onChange={() => {}}
					/>
					<SwitchRow
						label="Limit places"
						hint={
							placeLimit === null
								? undefined
								: `max: ${count.format(placeLimit)}`
						}
						description={
							draft.capped
								? "Its own places, counted inside the event's."
								: placeLimit === null
									? "Off: as many as register."
									: `Off: shares the event's ${count.format(placeLimit)} places with the other tickets.`
						}
						checked={draft.capped}
						onChange={(capped) => set({ capped })}
					>
						{draft.capped ? (
							<NumberField
								id={`${id}cap`}
								label="Places"
								value={draft.capacity}
								invalid={invalid("capacity")}
								describedBy={describe("capacity")}
								onChange={(capacity) => set({ capacity })}
							/>
						) : null}
						{fieldError("capacity")}
					</SwitchRow>
					<SwitchRow
						label="Per-person limit"
						description="How many of this ticket one person can register for."
						checked={draft.limitPerPerson}
						onChange={(limitPerPerson) => set({ limitPerPerson })}
					>
						{draft.limitPerPerson ? (
							<NumberField
								id={`${id}pp`}
								label="Most per person"
								value={draft.maxPerPerson}
								invalid={invalid("maxPerPerson")}
								describedBy={describe("maxPerPerson")}
								onChange={(maxPerPerson) => set({ maxPerPerson })}
							/>
						) : null}
						{fieldError("maxPerPerson")}
					</SwitchRow>
					<SwitchRow
						label="Waitlist"
						hint="when full"
						description="When it's full, new guests join a waiting list instead of being turned away. You give them places from Guests."
						checked={draft.waitlist}
						onChange={(waitlist) => set({ waitlist })}
					/>
					<SwitchRow
						label="Invite only"
						hint="code or invite"
						description="Only people you invite, or who have its access code, can register for it."
						checked={draft.inviteOnly}
						onChange={(inviteOnly) => set({ inviteOnly })}
					/>
					<SwitchRow
						label="Transfers"
						hint="old pass voided"
						description="Guests can pass their ticket to someone else. Their old pass stops working."
						checked={draft.transferable}
						onChange={(transferable) => set({ transferable })}
					/>
					{multiDayEvent ? (
						<SwitchRow
							label="Every day"
							hint="check in daily"
							description="On: they check in on each day. Off: they check in once, on any one day."
							checked={draft.multiDay}
							onChange={(multiDay) => set({ multiDay })}
						>
							{draft.multiDay ? (
								<fieldset
									className={styles.days}
									aria-describedby={describe("days", `${id}daysh`)}
								>
									<legend className={styles.label}>Days it admits</legend>
									<div className={styles.dayChips}>
										{eventDays.map((day) => {
											const on =
												draft.days.length === 0 || draft.days.includes(day);
											return (
												<label key={day} className={styles.dayChip}>
													<input
														type="checkbox"
														checked={on}
														onChange={(e) => {
															const current =
																draft.days.length === 0
																	? [...eventDays]
																	: draft.days;
															const next = e.target.checked
																? [...current, day]
																: current.filter((d) => d !== day);
															set({
																days:
																	next.length === eventDays.length
																		? []
																		: next.sort(),
															});
														}}
													/>
													{dayLabel(day)}
												</label>
											);
										})}
									</div>
									<p className={styles.hint} id={`${id}daysh`}>
										{draft.days.length === 0
											? "Every day of the event."
											: `${draft.days.length} of ${eventDays.length} days.`}
									</p>
									{fieldError("days")}
								</fieldset>
							) : null}
						</SwitchRow>
					) : null}
				</fieldset>
			</div>

			<footer className={styles.editorFoot}>
				<button
					type="button"
					className={styles.deleteButton}
					onClick={() => {
						setDeleteError(null);
						setConfirmDelete(true);
					}}
				>
					<TrashIcon /> Delete ticket
				</button>
			</footer>

			{/* Only with something to save or say, as on the Event Page: an
			    empty bar would sit under the editor as a blank outline. */}
			{dirty || message.tone !== "plain" || message.text ? (
				<SaveBar
					className={styles.saveBar}
					message={message}
					dirty={dirty}
					pending={pending}
					onDiscard={() => {
						setDraft(saved);
						setError(null);
						setMessage({ tone: "plain", text: "" });
					}}
					onSave={() => startTransition(async () => void (await save()))}
				/>
			) : null}

			<Popup
				open={confirmDelete}
				onClose={() => setConfirmDelete(false)}
				title="Delete this ticket?"
			>
				<p className={dialog.lead}>
					“{saved.name}” is deleted for good. A ticket guests hold can't be
					deleted: close its sales instead.
				</p>
				{deleteError ? (
					<p className={styles.fieldError} role="alert">
						{deleteError}
					</p>
				) : null}
				<div className={dialog.actions}>
					<button
						type="button"
						className={dialog.secondary}
						onClick={() => setConfirmDelete(false)}
						disabled={deleting}
					>
						Cancel
					</button>
					<button
						type="button"
						className={`${dialog.secondary} ${dialog.discard}`}
						disabled={deleting}
						aria-busy={deleting || undefined}
						onClick={() =>
							startDelete(async () => {
								const result = await deleteTicket(eventId, ticket.id);
								if (!result.ok) {
									setDeleteError(result.message);
									return;
								}
								setConfirmDelete(false);
								onDeleted();
							})
						}
					>
						{deleting ? "Deleting…" : "Delete ticket"}
					</button>
				</div>
			</Popup>
		</div>
	);
}

/**
 * One rule: its name, a short hint in brackets, a switch, and what it opens
 * when on. The full sentence is for screen readers; the hint is the glance.
 */
function SwitchRow({
	label,
	hint,
	description,
	checked,
	onChange,
	disabled = false,
	children,
}: {
	label: string;
	hint?: string | undefined;
	description: string;
	checked: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
	children?: React.ReactNode;
}) {
	const labelId = useId();
	const descriptionId = useId();
	return (
		<div className={styles.row}>
			<div className={styles.rowHead}>
				<p className={styles.rowLabel} id={labelId}>
					{label}
					{hint ? <span className={styles.rowHint}> ({hint})</span> : null}
				</p>
				<span className={styles.srOnly} id={descriptionId}>
					{description}
				</span>
				<button
					type="button"
					role="switch"
					aria-checked={checked}
					aria-labelledby={labelId}
					aria-describedby={descriptionId}
					className={styles.switch}
					disabled={disabled}
					onClick={() => onChange(!checked)}
				>
					<span className={styles.switchThumb} />
				</button>
			</div>
			{children}
		</div>
	);
}

/**
 * The pass as a guest will see it, its name following the draft. The code
 * is a fixed sample: a real pass carries a signed token, never shown here.
 */
function TicketPass({ name, pass }: { name: string; pass: PassDetails }) {
	const soonId = useId();
	return (
		<section className={styles.passBlock} aria-label="Ticket design">
			<div className={styles.passHead}>
				<div>
					<p className={styles.passTitle}>Ticket design</p>
					<p className={styles.hint}>Preview of the guest's pass</p>
				</div>
				<button
					type="button"
					className={styles.passEdit}
					disabled
					aria-describedby={soonId}
				>
					<EditIcon />
					Edit design
					<span className={styles.soon} id={soonId}>
						Soon
					</span>
				</button>
			</div>
			<figure className={styles.pass}>
				<div className={styles.passBody}>
					<p className={styles.passEvent}>{pass.eventTitle}</p>
					<p className={styles.passName}>{name}</p>
					<div className={styles.passFoot}>
						{pass.start ? (
							<time className={styles.passWhen} dateTime={pass.start.iso}>
								<span>{pass.start.date}</span>
								<span className={styles.passTime}>{pass.start.time}</span>
							</time>
						) : (
							<p className={styles.passWhen}>Date not set</p>
						)}
						<p className={styles.passPrice}>Free</p>
					</div>
				</div>
				<div className={styles.passStub}>
					<span className={styles.passCode}>
						<SampleCode />
					</span>
					<span className={styles.passSample}>Sample code</span>
				</div>
			</figure>
		</section>
	);
}

/** A drawn stand-in for a QR code: three finder squares and a few cells. */
function SampleCode() {
	return (
		<svg viewBox="0 0 21 21" aria-hidden="true" focusable="false">
			<path
				fill="currentColor"
				fillRule="evenodd"
				d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM14 0h7v7h-7zM15 1v5h5V1zM16 2h3v3h-3zM0 14h7v7H0zM1 15v5h5v-5zM2 16h3v3H2zM9 0h2v2H9zM9 3h1v3H9zM11 4h2v2h-2zM8 8h3v1H8zM12 8h2v3h-2zM15 9h3v2h-3zM19 8h2v2h-2zM0 9h2v2H0zM3 8h3v2H3zM4 11h3v1H4zM9 10h2v3H9zM8 14h2v2H8zM11 15h3v1h-3zM9 17h1v4H9zM11 18h2v3h-2zM14 13h2v2h-2zM17 13h4v1h-4zM16 16h2v2h-2zM19 15h2v3h-2zM14 18h1v3h-1zM17 19h2v2h-2z"
			/>
		</svg>
	);
}

function NumberField({
	id,
	label,
	value,
	hint,
	hintId,
	invalid,
	describedBy,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	hint?: string | undefined;
	hintId?: string;
	invalid: true | undefined;
	describedBy: string | undefined;
	onChange: (value: string) => void;
}) {
	return (
		<div className={styles.numberRow}>
			<label className={styles.numberLabel} htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				className={`${styles.input} ${styles.number}`}
				inputMode="numeric"
				autoComplete="off"
				value={value}
				maxLength={9}
				onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
				aria-invalid={invalid}
				aria-describedby={describedBy}
			/>
			{hint ? (
				<p className={styles.hint} id={hintId}>
					{hint}
				</p>
			) : null}
		</div>
	);
}
