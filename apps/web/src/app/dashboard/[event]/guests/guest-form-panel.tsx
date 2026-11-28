"use client";

import { type Answer, type FormField, visibleFields } from "@makemyevent/core";
import { useEffect, useId, useState, useTransition } from "react";
import { CloseIcon, UploadIcon } from "@/components/icons";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import { useCloseGuard } from "./close-guard";
import { PreviewField } from "../form-builder/form-preview";
import {
	editGuest,
	type GuestWriteResult,
	guestFormValues,
	inviteGuest,
} from "./guest-writes";
import styles from "./guests.module.css";

export type FormMode = { kind: "invite" } | { kind: "edit"; id: string } | null;

type Ticket = { id: string; name: string };

/**
 * What the form holds, written the same way whatever order it was filled
 * in, and with cleared answers left out: two equal fingerprints mean
 * nothing changed.
 */
function fingerprint(
	answers: Record<string, Answer>,
	other: Record<string, string>,
	ticketId: string,
	code: string,
): string {
	const kept = (record: Record<string, unknown>) =>
		Object.keys(record)
			.sort()
			.flatMap((key) => {
				const value = record[key];
				const empty =
					value === null ||
					value === undefined ||
					value === false ||
					(typeof value === "string" && value.trim() === "") ||
					(Array.isArray(value) && value.length === 0);
				return empty ? [] : [[key, value]];
			});
	return JSON.stringify([kept(answers), kept(other), ticketId, code.trim()]);
}

/**
 * Invite guest and Edit submission: the event's own form, filled in by the
 * team for a guest, with the ticket they hold. The same questions, rules
 * and "Show if" logic a guest meets; the server checks it all again.
 *
 * A full ticket asks before going ahead. An email that is already a guest
 * offers to open them instead.
 */
export function GuestFormPanel({
	eventId,
	mode,
	fields,
	tickets,
	emailReady,
	onClose,
	onSaved,
	onOpenGuest,
	onImport,
	walkIn = false,
}: {
	eventId: string;
	mode: FormMode;
	fields: FormField[];
	tickets: Ticket[];
	/** Email and pass signing are both set up, so a pass can be sent. */
	emailReady: boolean;
	onClose: () => void;
	/** After a save: the guest's id, to open them, and whether to email their pass. */
	onSaved: (id: string, emailPass: boolean) => void;
	/** Their email is already a guest's: open them (or, for a walk-in, let them in). */
	onOpenGuest: (id: string) => void;
	/** Opens bulk upload, for adding many at once; left out, it isn't offered. */
	onImport?: () => void;
	/** At the door: added and let in at once (the scanner checks them in). */
	walkIn?: boolean;
}) {
	const id = useId();
	const ref = useModalDialog(mode !== null);
	const [answers, setAnswers] = useState<Record<string, Answer>>({});
	const [other, setOther] = useState<Record<string, string>>({});
	const [ticketId, setTicketId] = useState(tickets[0]?.id ?? "");
	const [useCode, setUseCode] = useState(false);
	const [code, setCode] = useState("");
	const [emailPass, setEmailPass] = useState(true);
	const [result, setResult] = useState<Extract<
		GuestWriteResult,
		{ ok: false }
	> | null>(null);
	const [loading, setLoading] = useState(false);
	const [pending, startTransition] = useTransition();
	const editing = mode?.kind === "edit" ? mode.id : null;
	// The form as it opened, to tell whether anything was changed since.
	const [baseline, setBaseline] = useState<string | null>(null);

	// A fresh form each time it opens; for an edit, the guest's answers.
	useEffect(() => {
		if (!mode) return;
		setResult(null);
		setUseCode(false);
		setCode("");
		if (mode.kind === "invite") {
			setAnswers({});
			setOther({});
			setTicketId(tickets[0]?.id ?? "");
			setBaseline(fingerprint({}, {}, tickets[0]?.id ?? "", ""));
			return;
		}
		setBaseline(null);
		let current = true;
		setLoading(true);
		guestFormValues(eventId, mode.id)
			.then((values) => {
				if (!current) return;
				setLoading(false);
				if (!values) {
					setResult({ ok: false, message: "This guest could not be found." });
					return;
				}
				setAnswers(values.answers);
				setOther(values.other);
				setTicketId(values.ticketTypeId);
				setBaseline(
					fingerprint(values.answers, values.other, values.ticketTypeId, ""),
				);
			})
			.catch(() => {
				if (!current) return;
				setLoading(false);
				setResult({
					ok: false,
					message:
						"Couldn't load this guest. Check your connection and try again.",
				});
			});
		return () => {
			current = false;
		};
	}, [mode, eventId, tickets]);

	const shown = visibleFields(fields, answers, ticketId || null);

	function submit(force: boolean, waitlist = false) {
		startTransition(async () => {
			const values = { ticketTypeId: ticketId, answers, other, force };
			const saved = editing
				? await editGuest(eventId, editing, values)
				: await inviteGuest(eventId, {
						...values,
						code: useCode ? code : null,
						waitlist,
					});
			if (saved.ok) {
				ref.current?.close();
				// No pass for the waiting list: they have no place yet.
				onSaved(saved.id, !editing && !waitlist && emailReady && emailPass);
				return;
			}
			setResult(saved);
			// The first problem, in view, so it can be fixed straight away.
			requestAnimationFrame(() =>
				ref.current
					?.querySelector<HTMLElement>("[aria-invalid='true']")
					?.focus(),
			);
		});
	}

	const problems = result?.problems ?? {};
	const dirty =
		mode !== null &&
		baseline !== null &&
		fingerprint(answers, other, ticketId, useCode ? code : "") !== baseline;
	const guard = useCloseGuard(ref, dirty, {
		title: editing
			? "Save your changes?"
			: walkIn
				? "Add this walk-in?"
				: "Invite this guest?",
		body: editing
			? "You changed this guest's answers. Save them, or discard the changes and close."
			: walkIn
				? "What you entered isn't saved until they're added. Add them now, or discard it and close."
				: "What you entered isn't saved until they're invited. Invite them now, or discard it and close.",
		save: {
			label: editing
				? "Save changes"
				: walkIn
					? "Add and check in"
					: "Invite guest",
			run: () => submit(false),
		},
	});

	return (
		<dialog
			ref={ref}
			className={styles.panel}
			aria-labelledby={`${id}title`}
			onClose={ownClose(onClose)}
			{...guard.dialogProps}
		>
			<form
				className={styles.panelInner}
				noValidate
				onSubmit={(event) => {
					event.preventDefault();
					submit(false);
				}}
			>
				<header className={styles.panelHead}>
					<h3 className={styles.panelTitle} id={`${id}title`}>
						{editing
							? "Edit submission"
							: walkIn
								? "Add a walk-in"
								: "Invite a guest"}
					</h3>
					<button
						type="button"
						className={styles.iconButton}
						onClick={() => guard.requestClose()}
					>
						<CloseIcon />
						<span className={styles.srOnly}>Close</span>
					</button>
				</header>

				{loading ? (
					<div className={styles.panelBody} aria-busy="true">
						<p className={styles.srOnly} role="status">
							Loading their answers
						</p>
						<span
							className={`${styles.bone} ${styles.boneFacts}`}
							aria-hidden="true"
						/>
					</div>
				) : (
					<div className={styles.panelBody}>
						{editing || !onImport ? null : (
							<div className={styles.bulkOffer}>
								<p className={styles.bulkOfferText}>
									Adding many guests?
									<span className={styles.formHint}>
										Upload a CSV or a Google Sheet, checked before anyone is
										added
									</span>
								</p>
								<button
									type="button"
									className={styles.secondary}
									onClick={() => guard.requestClose(onImport)}
								>
									<UploadIcon /> Bulk upload
								</button>
							</div>
						)}
						<label className={styles.formRow}>
							<span className={styles.formLabel}>Ticket</span>
							<select
								className={styles.select}
								value={ticketId}
								aria-invalid={problems.ticket ? true : undefined}
								onChange={(event) => setTicketId(event.target.value)}
							>
								{tickets.map((ticket) => (
									<option key={ticket.id} value={ticket.id}>
										{ticket.name}
									</option>
								))}
							</select>
							{problems.ticket ? (
								<span className={styles.fieldError}>{problems.ticket}</span>
							) : null}
						</label>

						{editing ? null : (
							<div className={styles.formRow}>
								<label className={styles.switchRow}>
									<input
										type="checkbox"
										checked={useCode}
										onChange={(event) => setUseCode(event.target.checked)}
									/>
									<span>
										Use my own ticket code
										<span className={styles.formHint}>
											Otherwise one like MME-7Q4K-2291 is made
										</span>
									</span>
								</label>
								{useCode ? (
									<>
										<label className={styles.srOnly} htmlFor={`${id}code`}>
											Ticket code
										</label>
										<input
											id={`${id}code`}
											className={styles.codeInput}
											value={code}
											maxLength={32}
											placeholder="VIP-001"
											autoCapitalize="characters"
											spellCheck={false}
											aria-invalid={problems.code ? true : undefined}
											onChange={(event) =>
												setCode(event.target.value.toUpperCase())
											}
										/>
										{problems.code ? (
											<span className={styles.fieldError}>{problems.code}</span>
										) : null}
									</>
								) : null}
							</div>
						)}

						<div className={styles.formFields}>
							{fields.map((field) =>
								shown.has(field.id) ? (
									<PreviewField
										key={field.id}
										field={field}
										answer={answers[field.id] ?? null}
										otherText={other[field.id] ?? ""}
										problem={problems[field.id] ?? null}
										onAnswer={(value) => {
											setAnswers((current) => ({
												...current,
												[field.id]: value,
											}));
											setResult(null);
										}}
										onOther={(text) =>
											setOther((current) => ({ ...current, [field.id]: text }))
										}
									/>
								) : null,
							)}
						</div>

						{editing ? null : emailReady ? (
							<label className={styles.switchRow}>
								<input
									type="checkbox"
									checked={emailPass}
									onChange={(event) => setEmailPass(event.target.checked)}
								/>
								<span>
									Email their pass
									<span className={styles.formHint}>
										The QR and ticket code, to the email above
									</span>
								</span>
							</label>
						) : (
							<p className={styles.formNote}>
								Emailing passes isn't set up yet. They're added with a ticket
								and code you can share.
							</p>
						)}
					</div>
				)}

				<footer className={styles.panelFoot}>
					{result ? (
						<div className={styles.formResult} role="alert">
							<p>{result.message}</p>
							{result.waitlist && !editing ? (
								<button
									type="button"
									className={styles.primary}
									disabled={pending}
									onClick={() => submit(false, true)}
								>
									Add to waiting list
								</button>
							) : null}
							{result.confirm ? (
								<button
									type="button"
									className={
										result.waitlist && !editing
											? styles.secondary
											: styles.primary
									}
									disabled={pending}
									onClick={() => submit(true)}
								>
									{editing ? "Save anyway" : "Invite anyway"}
								</button>
							) : null}
							{result.existingId ? (
								<button
									type="button"
									className={styles.secondary}
									onClick={() => {
										const existing = result.existingId;
										ref.current?.close();
										if (existing) onOpenGuest(existing);
									}}
								>
									{walkIn ? "Check them in instead" : "Open their details"}
								</button>
							) : null}
						</div>
					) : null}
					<div className={styles.footActions}>
						<button
							type="button"
							className={styles.secondary}
							onClick={() => guard.requestClose()}
						>
							Back
						</button>
						<button
							type="submit"
							className={styles.primary}
							disabled={pending || loading || tickets.length === 0}
							aria-busy={pending || undefined}
						>
							{pending
								? "Saving…"
								: editing
									? "Save changes"
									: walkIn
										? "Add and check in"
										: "Invite guest"}
						</button>
					</div>
				</footer>
			</form>
			{guard.popup}
		</dialog>
	);
}
