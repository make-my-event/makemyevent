"use client";

import { BLOCKLIST_LIMIT, type ContactKind } from "@makemyevent/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CloseIcon, MailIcon, PhoneIcon, RightIcon } from "@/components/icons";
import { exactTime } from "../../overview/time-ago";
import { blockContacts, unblockContact } from "./actions";
import styles from "./blocklist.module.css";

export type BlockedEntry = {
	id: string;
	kind: ContactKind;
	value: string;
	at: string;
	by: string | null;
};

/**
 * The blocklist: emails on one side, phone numbers on the other. Paste one
 * or many; each change saves at once. Blocking stops new places; anyone
 * already registered with a blocked contact is named, so the team can
 * decide whether to cancel them.
 */
export function Blocklist({
	eventId,
	entries,
	guestsHref,
	timeZone,
}: {
	eventId: string;
	entries: BlockedEntry[];
	guestsHref: string;
	timeZone: string | null;
}) {
	return (
		<div className={styles.page}>
			<header className={styles.head}>
				<Link className={styles.back} href={guestsHref}>
					<RightIcon className={styles.flip} />
					Guests
				</Link>
				<h3 className={styles.title}>Blocklist</h3>
				<p className={styles.lead}>
					Emails and phone numbers that can't register for this event. Changes
					save as you make them.
				</p>
			</header>
			<div className={styles.columns}>
				<Column
					eventId={eventId}
					kind="email"
					entries={entries.filter((e) => e.kind === "email")}
					timeZone={timeZone}
				/>
				<Column
					eventId={eventId}
					kind="phone"
					entries={entries.filter((e) => e.kind === "phone")}
					timeZone={timeZone}
				/>
			</div>
		</div>
	);
}

function Column({
	eventId,
	kind,
	entries,
	timeZone,
}: {
	eventId: string;
	kind: ContactKind;
	entries: BlockedEntry[];
	timeZone: string | null;
}) {
	const id = useId();
	const router = useRouter();
	const [text, setText] = useState("");
	const [message, setMessage] = useState<{
		tone: "ok" | "error";
		text: string;
	} | null>(null);
	const [pending, startTransition] = useTransition();
	const [removing, setRemoving] = useState<string | null>(null);
	const email = kind === "email";
	const noun = email ? "email" : "number";

	function add() {
		startTransition(async () => {
			const result = await blockContacts(eventId, kind, text);
			if (!result.ok) {
				setMessage({ tone: "error", text: result.message });
				return;
			}
			const parts = [
				result.added === 1
					? `Blocked 1 ${noun}.`
					: `Blocked ${result.added} ${noun}s.`,
			];
			if (result.already > 0)
				parts.push(
					`${result.already} ${result.already === 1 ? "was" : "were"} already on the list.`,
				);
			if (result.registered.length > 0)
				parts.push(
					`Already registered: ${result.registered.join(", ")}. Blocking doesn't remove them; cancel their registration from Guests if you need to.`,
				);
			setMessage({ tone: "ok", text: parts.join(" ") });
			setText("");
			router.refresh();
		});
	}

	function remove(entry: BlockedEntry) {
		setRemoving(entry.id);
		startTransition(async () => {
			const result = await unblockContact(eventId, entry.id);
			setRemoving(null);
			setMessage(
				result.ok
					? { tone: "ok", text: `${entry.value} can register again.` }
					: { tone: "error", text: result.message },
			);
			router.refresh();
		});
	}

	return (
		<section className={styles.column} aria-labelledby={`${id}title`}>
			<header className={styles.columnHead}>
				<span className={styles.columnIcon}>
					{email ? <MailIcon /> : <PhoneIcon />}
				</span>
				<h4 className={styles.columnTitle} id={`${id}title`}>
					{email ? "Emails" : "Phone numbers"}
				</h4>
				<span className={styles.count}>
					{entries.length}
					<span className={styles.srOnly}> of {BLOCKLIST_LIMIT}</span>
				</span>
			</header>

			<form
				className={styles.add}
				onSubmit={(event) => {
					event.preventDefault();
					add();
				}}
			>
				<label className={styles.label} htmlFor={`${id}input`}>
					{email ? "Block an email" : "Block a number"}
				</label>
				<div className={styles.addRow}>
					<input
						id={`${id}input`}
						className={styles.input}
						type="text"
						inputMode={email ? "email" : "tel"}
						autoComplete="off"
						spellCheck={false}
						placeholder={email ? "name@example.com" : "98765 43210"}
						value={text}
						aria-describedby={`${id}hint ${id}message`}
						onChange={(event) => {
							setText(event.target.value);
							setMessage(null);
						}}
						// A one-line box drops line breaks, which would join a pasted
						// column into one entry; they become commas instead.
						onPaste={(event) => {
							const pasted = event.clipboardData.getData("text");
							if (!/[\r\n]/.test(pasted)) return;
							event.preventDefault();
							const input = event.currentTarget;
							const start = input.selectionStart ?? text.length;
							const end = input.selectionEnd ?? text.length;
							const joined = pasted
								.split(/\r?\n/)
								.map((line) => line.trim())
								.filter(Boolean)
								.join(", ");
							setText(text.slice(0, start) + joined + text.slice(end));
							setMessage(null);
						}}
					/>
					<button
						type="submit"
						className={styles.primary}
						disabled={pending || !text.trim()}
						aria-busy={pending || undefined}
					>
						Block
					</button>
				</div>
				<p className={styles.hint} id={`${id}hint`}>
					{email
						? "Paste many at once, separated by commas or new lines."
						: "+91 unless you write another code. Paste many at once, separated by commas."}
				</p>
				<p
					className={styles.message}
					id={`${id}message`}
					data-tone={message?.tone}
					aria-live="polite"
				>
					{message?.text ?? ""}
				</p>
			</form>

			{entries.length === 0 ? (
				<p className={styles.empty}>
					{email
						? "No emails blocked. Anyone with an address can register."
						: "No numbers blocked."}
				</p>
			) : (
				<ul className={styles.list}>
					{entries.map((entry) => (
						<li
							key={entry.id}
							className={styles.entry}
							data-leaving={removing === entry.id || undefined}
						>
							<span className={styles.entryText}>
								<span className={styles.value}>{entry.value}</span>
								<span className={styles.meta}>
									{entry.by ? `${entry.by}, ` : ""}
									{exactTime(new Date(entry.at), timeZone)}
								</span>
							</span>
							<button
								type="button"
								className={styles.remove}
								disabled={pending}
								onClick={() => remove(entry)}
							>
								<CloseIcon />
								<span className={styles.srOnly}>Unblock {entry.value}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
