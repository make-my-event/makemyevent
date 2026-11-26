"use client";

import { CloseIcon } from "@/components/icons";
import Link from "next/link";
import { EVENT_TITLE_MAX } from "@makemyevent/core";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import { browserZone } from "@/lib/browser-zone";
import { createEvent } from "./create-event-action";
import styles from "./create-event.module.css";
import { HostPicker } from "./host-picker";
import toolbar from "./toolbar.module.css";
import type { Workspace } from "./types";

/**
 * Create Event: the toolbar's primary action, and the popup it opens.
 *
 *   ┌ Create an event ──────────────────── ✕ ┐
 *   │ Event name                              │
 *   │ [ Winter Build                        ] │
 *   │ Host                                    │
 *   │ [ GA  Ganesh Adimalupu · Personal   ⌄ ] │
 *   │                     [ Cancel ] [ Continue ] │
 *   └─────────────────────────────────────────┘
 *
 * It asks only the two things every event needs before anything else can be
 * filled in: what it is called, and who hosts it. The rest comes on the next
 * screen.
 *
 * The trigger is a button, because it opens something rather than going
 * somewhere ("<button> for actions, <a> for navigation"). It was a link to
 * /events/new, and a click that landed before script had loaded followed the
 * link to a page instead of opening the popup, so the same button behaved
 * two ways. /events/new still exists for anyone who goes there directly.
 *
 * The popup is a native <dialog> opened with showModal(): the browser traps
 * focus inside it, makes the page behind it inert, closes it on Escape and
 * puts focus back on the button afterwards, as the WAI-ARIA modal dialog
 * pattern asks.
 *
 * Continue creates the event as a draft and opens its Event Page section,
 * where everything else is filled in. Nothing is public until it is
 * published.
 */
export function CreateEventButton({
	workspaces,
	activeWorkspaceId,
	label = "Create Event",
	className = toolbar.create,
	icon = true,
}: {
	workspaces: readonly Workspace[];
	activeWorkspaceId: string;
	/** The same popup from elsewhere, e.g. an empty list's "Create your first event". */
	label?: string;
	className?: string | undefined;
	icon?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const dialogRef = useModalDialog(open);

	// showModal() focuses the first control it finds, which is Close; the
	// name is what the popup was opened for. After the render that mounts
	// the form, so the field is there.
	useEffect(() => {
		if (open)
			dialogRef.current
				?.querySelector<HTMLInputElement>("input[name=title]")
				?.focus();
	}, [open, dialogRef]);

	return (
		<>
			<button
				type="button"
				className={className}
				aria-haspopup="dialog"
				title={className === toolbar.create ? label : undefined}
				onClick={() => setOpen(true)}
			>
				{icon ? (
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
				) : null}
				{/* In the toolbar on a phone the label is read out but not shown:
				    the button is a square + beside the search. */}
				<span
					className={
						className === toolbar.create ? toolbar.createLabel : undefined
					}
				>
					{label}
				</span>
			</button>

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: the click only closes on a backdrop press; Escape is the keyboard's way out, built into <dialog> */}
			<dialog
				ref={dialogRef}
				className={styles.dialog}
				aria-labelledby="create-event-title"
				onClose={ownClose(() => setOpen(false))}
				// A press on the backdrop (the dialog element itself, outside its
				// panel) closes it, as people expect of a popup.
				onClick={(event) => {
					if (event.target === event.currentTarget) dialogRef.current?.close();
				}}
			>
				{/* Remounted on every open, so it always starts empty. */}
				{open ? (
					<CreateEventForm
						workspaces={workspaces}
						activeWorkspaceId={activeWorkspaceId}
						onCancel={() => dialogRef.current?.close()}
					/>
				) : null}
			</dialog>
		</>
	);
}

/**
 * The name and host, and Continue. Used in the popup, and on its own at
 * /events/new for anyone who reaches that address directly or before script
 * has loaded: the form posts to the same server action either way.
 */
export function CreateEventForm({
	workspaces,
	activeWorkspaceId,
	onCancel,
	cancelHref,
	defaultTitle = "",
}: {
	workspaces: readonly Workspace[];
	activeWorkspaceId: string;
	onCancel?: () => void;
	cancelHref?: string;
	defaultTitle?: string;
}) {
	const titleId = useId();
	const errorId = useId();
	const formRef = useRef<HTMLFormElement>(null);
	const [host, setHost] = useState(activeWorkspaceId);
	// Held here rather than left to the input: React clears a form's fields
	// after an action, and a name the server sent back must stay to be fixed.
	const [title, setTitle] = useState(defaultTitle);
	const [error, setError] = useState<string | null>(null);
	const [state, formAction, pending] = useActionState(createEvent, null);

	// Where the host is, so the event starts in a time zone that is likely
	// right; only the browser knows it. Changed on the Event Page.
	const [timeZone, setTimeZone] = useState("");
	useEffect(() => setTimeZone(browserZone()), []);

	// A name the server turned down is shown like one the browser did.
	useEffect(() => {
		if (state?.field !== "title") return;
		setError(state.message);
		formRef.current
			?.querySelector<HTMLInputElement>("input[name=title]")
			?.focus();
	}, [state]);

	const formError = state && state.field !== "title" ? state.message : null;

	function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		const title = new FormData(event.currentTarget).get("title");
		if (typeof title !== "string" || title.trim() === "") {
			event.preventDefault();
			setError("Give the event a name.");
			event.currentTarget
				.querySelector<HTMLInputElement>("input[name=title]")
				?.focus();
		}
	}

	return (
		<form
			ref={formRef}
			className={styles.panel}
			action={formAction}
			noValidate
			onSubmit={onSubmit}
		>
			<input type="hidden" name="timeZone" value={timeZone} />
			<div className={styles.head}>
				<h2 className={styles.title} id="create-event-title">
					Create an event
				</h2>
				{onCancel ? (
					<button type="button" className={styles.close} onClick={onCancel}>
						<span className={styles.srOnly}>Close</span>
						<CloseIcon />
					</button>
				) : null}
			</div>

			<div className={styles.field}>
				<label className={styles.label} htmlFor={titleId}>
					Event name
				</label>
				<input
					className={styles.input}
					id={titleId}
					name="title"
					type="text"
					placeholder="e.g. Winter Build Hackathon"
					maxLength={EVENT_TITLE_MAX}
					autoComplete="off"
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? errorId : undefined}
					value={title}
					onChange={(event) => {
						setTitle(event.target.value);
						setError(null);
					}}
				/>
				{error ? (
					<p className={styles.error} id={errorId}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="9" />
							<path d="M12 7.5v5M12 16h.01" />
						</svg>
						{error}
					</p>
				) : null}
			</div>

			<div className={styles.field}>
				<span className={styles.label} id={`${titleId}-host`}>
					Host
				</span>
				<HostPicker
					labelledBy={`${titleId}-host`}
					workspaces={workspaces}
					value={host}
					onChange={setHost}
				/>
			</div>

			{formError ? (
				<p className={styles.error} role="alert">
					{formError}
				</p>
			) : null}

			<div className={styles.actions}>
				{onCancel ? (
					<button type="button" className={styles.secondary} onClick={onCancel}>
						Cancel
					</button>
				) : (
					<Link className={styles.secondary} href={cancelHref ?? "/dashboard"}>
						Cancel
					</Link>
				)}
				<button
					type="submit"
					className={styles.primary}
					disabled={pending}
					aria-busy={pending || undefined}
				>
					{pending ? "Creating…" : "Continue"}
				</button>
			</div>
		</form>
	);
}
