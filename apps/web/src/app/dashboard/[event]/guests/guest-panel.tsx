"use client";

import { guestInitials } from "@makemyevent/core";
import { useEffect, useId, useState, useTransition } from "react";
import {
	CloseIcon,
	CopyIcon,
	MailIcon,
	QrIcon,
	RightIcon,
	TickIcon,
	UndoIcon,
} from "@/components/icons";
import {
	isBackdropClick,
	ownClose,
	useModalDialog,
} from "@/components/ui/use-modal-dialog";
import { exactTime } from "../overview/time-ago";
import { Popup } from "../../popup";
import { checkIn, type GuestDetail, getGuest, undoCheckIn } from "./actions";
import { setCancelled } from "./guest-writes";
import { getPass, type PassView, sendPasses } from "./passes";
import styles from "./guests.module.css";

const SOURCE: Record<string, string> = {
	self: "Registered",
	invite: "Invited",
	bulk: "Imported",
};

/**
 * One guest, in a panel at the side of the list: their ticket and its
 * code, when they registered, whether they're in, and every answer to the
 * form. ‹ and › step through the guests on this page.
 *
 * A modal <dialog>: focus stays in it, Escape closes it, and focus goes
 * back to the guest's name in the list.
 */
export function GuestPanel({
	eventId,
	openId,
	order,
	timeZone,
	canManage,
	onOpen,
	onEdit,
	onChanged,
}: {
	eventId: string;
	openId: string | null;
	/** The guests on this page, in order, for ‹ and ›. */
	order: string[];
	timeZone: string | null;
	/** Owner, admin or organizer: may edit, cancel and restore. */
	canManage: boolean;
	onOpen: (id: string | null) => void;
	/** Opens Edit submission for this guest. */
	onEdit: (id: string) => void;
	/** After a check-in, so the list behind shows it. */
	onChanged: () => void;
}) {
	const id = useId();
	const ref = useModalDialog(openId !== null);
	const [guest, setGuest] = useState<GuestDetail | null>(null);
	const [state, setState] = useState<
		"loading" | "ready" | "missing" | "failed"
	>("loading");
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState<string | null>(null);
	// Each action has its own busy state, so a button only says it is working
	// when it is the one at work; any of them busy holds the others back.
	const [checking, startCheck] = useTransition();
	const [mailing, startMail] = useTransition();
	const [cancelling, startCancel] = useTransition();
	const pending = checking || mailing || cancelling;
	const [reload, setReload] = useState(0);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [restoreFull, setRestoreFull] = useState<string | null>(null);
	const [pass, setPass] = useState<PassView | "loading" | null>(null);
	const [mail, setMail] = useState<{
		tone: "ok" | "error";
		text: string;
	} | null>(null);

	// The guest, fresh each time one is opened. A slower answer for a guest
	// already left behind is dropped.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reload asks again on purpose
	useEffect(() => {
		if (!openId) return;
		let current = true;
		setState((s) => (guest?.id === openId ? s : "loading"));
		setError(null);
		getGuest(eventId, openId)
			.then((found) => {
				if (!current) return;
				setGuest(found);
				setState(found ? "ready" : "missing");
			})
			.catch(() => current && setState("failed"));
		return () => {
			current = false;
		};
	}, [eventId, openId, reload]);

	// An email result belongs to the guest it was sent to: kept through the
	// refresh that follows sending, cleared when another guest opens.
	// biome-ignore lint/correctness/useExhaustiveDependencies: openId is the trigger
	useEffect(() => {
		setMail(null);
	}, [openId]);

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(null), 2000);
		return () => window.clearTimeout(timer);
	}, [copied]);

	const at = openId ? order.indexOf(openId) : -1;
	const previous = at > 0 ? order[at - 1] : undefined;
	const next = at >= 0 && at < order.length - 1 ? order[at + 1] : undefined;
	const shown = state === "ready" && guest?.id === openId ? guest : null;
	const checkedIn = shown ? shown.checkIns.length > 0 : false;

	async function copy(key: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(key);
		} catch {
			// Refused: the text is still there to select by hand.
		}
	}

	function toggleCheckIn() {
		if (!shown) return;
		startCheck(async () => {
			const result = checkedIn
				? await undoCheckIn(eventId, shown.id)
				: await checkIn(eventId, shown.id);
			if (!result.ok) {
				setError(result.message);
				return;
			}
			setReload((n) => n + 1);
			onChanged();
		});
	}

	function openPass() {
		if (!shown) return;
		setPass("loading");
		getPass(eventId, shown.id)
			.then(setPass)
			.catch(() =>
				setPass({
					ok: false,
					message: "Couldn't load the pass. Check your connection.",
				}),
			);
	}

	function emailPass() {
		if (!shown) return;
		setMail(null);
		startMail(async () => {
			const result = await sendPasses(eventId, [shown.id]);
			if (!result.ok) {
				setMail({ tone: "error", text: result.message });
				return;
			}
			const why = result.skipped[0]?.reason ?? result.failed[0]?.reason;
			setMail(
				result.sent > 0
					? { tone: "ok", text: `Pass emailed to ${shown.email}.` }
					: { tone: "error", text: why ? `Not sent: ${why}.` : "Not sent." },
			);
			setReload((n) => n + 1);
		});
	}

	function changeCancelled(cancelled: boolean, force = false) {
		if (!shown) return;
		startCancel(async () => {
			const result = await setCancelled(eventId, shown.id, cancelled, force);
			setConfirmCancel(false);
			if (!result.ok) {
				if (result.confirm) setRestoreFull(result.message);
				else setError(result.message);
				return;
			}
			setRestoreFull(null);
			setReload((n) => n + 1);
			onChanged();
		});
	}

	return (
		<dialog
			ref={ref}
			className={styles.panel}
			aria-labelledby={`${id}title`}
			onClose={ownClose(() => onOpen(null))}
			// Nothing to lose here, so a press outside the panel closes it.
			onClick={(event) => {
				if (isBackdropClick(event)) ref.current?.close();
			}}
			onKeyDown={(event) => {
				// ‹ and › from the keyboard too, unless typing somewhere.
				if (event.target instanceof HTMLInputElement) return;
				if (event.key === "ArrowLeft" && previous) onOpen(previous);
				if (event.key === "ArrowRight" && next) onOpen(next);
			}}
		>
			<div className={styles.panelInner}>
				<header className={styles.panelHead}>
					<h3 className={styles.panelTitle} id={`${id}title`}>
						Guest
						{at >= 0 ? (
							<span className={styles.panelPlace}>
								{at + 1} of {order.length}
							</span>
						) : null}
					</h3>
					<div className={styles.panelNav}>
						<button
							type="button"
							className={styles.iconButton}
							disabled={!previous}
							onClick={() => previous && onOpen(previous)}
						>
							<RightIcon className={styles.flip} />
							<span className={styles.srOnly}>Previous guest</span>
						</button>
						<button
							type="button"
							className={styles.iconButton}
							disabled={!next}
							onClick={() => next && onOpen(next)}
						>
							<RightIcon />
							<span className={styles.srOnly}>Next guest</span>
						</button>
						<button
							type="button"
							className={styles.iconButton}
							onClick={() => ref.current?.close()}
						>
							<CloseIcon />
							<span className={styles.srOnly}>Close</span>
						</button>
					</div>
				</header>

				{state === "missing" ? (
					<p className={styles.panelNote}>
						This guest is no longer on the list. They may have been removed.
					</p>
				) : state === "failed" ? (
					<p className={styles.panelNote}>
						Couldn't load this guest. Check your connection, then{" "}
						<button
							type="button"
							className={styles.inline}
							onClick={() => setReload((n) => n + 1)}
						>
							try again
						</button>
						.
					</p>
				) : !shown ? (
					<PanelSkeleton />
				) : (
					<div className={styles.panelBody} aria-busy={pending || undefined}>
						<div className={styles.person}>
							<span className={styles.avatarLarge} aria-hidden="true">
								{guestInitials(shown.name)}
							</span>
							<div className={styles.personText}>
								<p className={styles.personName}>{shown.name}</p>
								<p className={styles.personEmail}>{shown.email}</p>
							</div>
						</div>

						<dl className={styles.facts}>
							<div className={styles.fact}>
								<dt>Ticket</dt>
								<dd>{shown.ticketName}</dd>
							</div>
							<div className={styles.fact}>
								<dt>Ticket code</dt>
								<dd>
									<button
										type="button"
										className={styles.code}
										onClick={() => copy("code", shown.ticketCode)}
									>
										{shown.ticketCode}
										{copied === "code" ? <TickIcon /> : <CopyIcon />}
										<span className={styles.srOnly}>
											{copied === "code" ? "Copied" : "Copy"}
										</span>
									</button>
								</dd>
							</div>
							<div className={styles.fact}>
								<dt>Registered</dt>
								<dd>{exactTime(new Date(shown.registeredAt), timeZone)}</dd>
							</div>
							<div className={styles.fact}>
								<dt>Joined by</dt>
								<dd>
									{SOURCE[shown.source] ?? "Registered"}
									{shown.invitedBy ? ` by ${shown.invitedBy}` : ""}
								</dd>
							</div>
						</dl>

						<div className={styles.checkState} data-in={checkedIn || undefined}>
							{checkedIn ? (
								<>
									<p className={styles.checkLine}>
										<TickIcon /> Checked in
									</p>
									<ul className={styles.checkList}>
										{shown.checkIns.map((c) => (
											<li key={c.at}>
												{exactTime(new Date(c.at), timeZone)}
												{c.by ? `, by ${c.by}` : ""}
											</li>
										))}
									</ul>
								</>
							) : (
								<p className={styles.checkLine}>Not checked in</p>
							)}
						</div>

						{error ? (
							<p className={styles.panelError} role="alert">
								{error}
							</p>
						) : null}

						<div className={styles.panelActions}>
							<button
								type="button"
								className={checkedIn ? styles.secondary : styles.primary}
								disabled={pending || shown.status !== "confirmed"}
								aria-busy={checking || undefined}
								onClick={toggleCheckIn}
							>
								{checkedIn ? <UndoIcon /> : <TickIcon />}
								{checking
									? "Saving…"
									: checkedIn
										? "Undo check-in"
										: "Check in"}
							</button>
							<button
								type="button"
								className={styles.secondary}
								disabled={shown.status !== "confirmed"}
								onClick={openPass}
							>
								<QrIcon /> View pass
							</button>
						</div>
						{shown.status === "waitlisted" ? (
							<p className={styles.panelNote}>
								On the waiting list: they can be checked in once they have a
								place.
							</p>
						) : null}

						{shown.status === "cancelled" ? (
							<p className={styles.cancelledNote}>
								Cancelled. They hold no place and aren't counted; their answers
								are kept.
							</p>
						) : null}

						<section
							className={styles.answers}
							aria-labelledby={`${id}answers`}
						>
							<h4 className={styles.answersTitle} id={`${id}answers`}>
								Answers
							</h4>
							{shown.answers.length === 0 ? (
								<p className={styles.panelNote}>
									The form asks nothing beyond name and email.
								</p>
							) : (
								<dl className={styles.answerList}>
									{shown.answers.map((answer) => (
										<div key={answer.id} className={styles.answer}>
											<dt>
												{answer.label}
												{answer.removed ? (
													<span className={styles.removed}>
														{" "}
														(no longer on the form)
													</span>
												) : null}
											</dt>
											<dd>
												{answer.text ? (
													<button
														type="button"
														className={styles.copyAnswer}
														onClick={() => copy(answer.id, answer.text)}
													>
														{answer.text}
														<span
															className={styles.copyHint}
															aria-hidden="true"
														>
															{copied === answer.id ? "Copied" : "Copy"}
														</span>
														<span className={styles.srOnly}>
															{copied === answer.id ? ", copied" : ", copy"}
														</span>
													</button>
												) : (
													<span className={styles.none}>Not answered</span>
												)}
											</dd>
										</div>
									))}
								</dl>
							)}
						</section>

						{mail ? (
							<p
								className={styles.mailNote}
								data-tone={mail.tone}
								role="status"
							>
								{mail.text}
							</p>
						) : shown.ticketSentAt ? (
							<p className={styles.mailNote}>
								Pass last emailed{" "}
								{exactTime(new Date(shown.ticketSentAt), timeZone)}
							</p>
						) : null}

						{canManage ? (
							<div className={styles.manage}>
								{shown.status !== "confirmed" ? (
									<>
										<button
											type="button"
											className={
												shown.status === "waitlisted"
													? styles.primary
													: styles.secondary
											}
											disabled={pending}
											onClick={() => changeCancelled(false)}
										>
											{shown.status === "waitlisted"
												? "Give them a place"
												: "Restore their place"}
										</button>
										{restoreFull ? (
											<div className={styles.formResult} role="alert">
												<p>{restoreFull}</p>
												<button
													type="button"
													className={styles.primary}
													disabled={pending}
													onClick={() => changeCancelled(false, true)}
												>
													Give a place anyway
												</button>
											</div>
										) : null}
										{shown.status === "waitlisted" ? (
											<button
												type="button"
												className={styles.danger}
												disabled={pending}
												onClick={() => setConfirmCancel(true)}
											>
												Take off the waiting list
											</button>
										) : null}
									</>
								) : (
									<>
										<button
											type="button"
											className={styles.secondary}
											disabled={pending || shown.status !== "confirmed"}
											onClick={emailPass}
										>
											<MailIcon />
											{mailing
												? "Sending…"
												: shown.ticketSentAt
													? "Email pass again"
													: "Email pass"}
										</button>
										<button
											type="button"
											className={styles.secondary}
											onClick={() => {
												const guestId = shown.id;
												ref.current?.close();
												onEdit(guestId);
											}}
										>
											Edit submission
										</button>
										<button
											type="button"
											className={styles.danger}
											disabled={pending}
											onClick={() => setConfirmCancel(true)}
										>
											Cancel registration
										</button>
									</>
								)}
							</div>
						) : null}
					</div>
				)}
			</div>
			<Popup
				open={pass !== null}
				onClose={() => setPass(null)}
				title={shown ? `${shown.name}'s pass` : "Pass"}
			>
				{pass === "loading" || pass === null ? (
					<p className={styles.popupText} role="status">
						Making the pass…
					</p>
				) : pass.ok ? (
					<div className={styles.pass}>
						<div
							className={styles.passDesign}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: drawn by renderPass on the server, every word escaped
							dangerouslySetInnerHTML={{ __html: pass.pass }}
						/>
						<div
							className={styles.passQr}
							role="img"
							aria-label={`QR code for ${pass.name}'s pass`}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: an SVG the server drew from a token it signed; no guest text is in it
							dangerouslySetInnerHTML={{ __html: pass.svg }}
						/>
						<p className={styles.passCode}>{pass.ticketCode}</p>
						<p className={styles.popupText}>
							{pass.ticketName}, {pass.eventTitle}
							{pass.when ? `, ${pass.when}` : ""}
						</p>
					</div>
				) : (
					<p className={styles.popupText}>{pass.message}</p>
				)}
			</Popup>
			<Popup
				open={confirmCancel}
				onClose={() => setConfirmCancel(false)}
				title={
					shown
						? `Cancel ${shown.name}'s registration?`
						: "Cancel registration?"
				}
			>
				<p className={styles.popupText}>
					Their place goes back to the event and they leave the guest list.
					Their answers are kept, and you can restore them later from "Show
					cancelled guests".
				</p>
				<div className={styles.footActions}>
					<button
						type="button"
						className={styles.secondary}
						onClick={() => setConfirmCancel(false)}
					>
						Keep them
					</button>
					<button
						type="button"
						className={styles.danger}
						disabled={pending}
						onClick={() => changeCancelled(true)}
					>
						{cancelling ? "Cancelling…" : "Cancel registration"}
					</button>
				</div>
			</Popup>
		</dialog>
	);
}

function PanelSkeleton() {
	return (
		<div className={styles.panelBody} aria-busy="true">
			<p className={styles.srOnly} role="status">
				Loading guest
			</p>
			<div className={styles.person} aria-hidden="true">
				<span className={`${styles.avatarLarge} ${styles.bone}`} />
				<div className={styles.personText}>
					<span className={`${styles.bone} ${styles.boneName}`} />
					<span className={`${styles.bone} ${styles.boneEmail}`} />
				</div>
			</div>
			<span
				className={`${styles.bone} ${styles.boneFacts}`}
				aria-hidden="true"
			/>
			<span
				className={`${styles.bone} ${styles.boneAction}`}
				aria-hidden="true"
			/>
		</div>
	);
}
