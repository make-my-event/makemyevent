"use client";

import {
	type FormField,
	IMPORT_TEXT_LIMIT,
	templateHeader,
	csvLine,
} from "@makemyevent/core";
import { useEffect, useId, useState, useTransition } from "react";
import {
	CloseIcon,
	DownloadIcon,
	RightIcon,
	UploadIcon,
} from "@/components/icons";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import { useCloseGuard } from "./close-guard";
import {
	type ImportPreview,
	type ImportSource,
	importGuests,
	previewImport,
} from "./import-actions";
import { sendPasses } from "./passes";
import styles from "./guests.module.css";

type Ticket = { id: string; name: string };

const SHOWN_ROWS = 100;

/** A call that didn't come back: said in the panel, never a broken page. */
const FAILED: { ok: false; message: string; confirm?: boolean } = {
	ok: false,
	message: "That didn't go through. Check your connection and try again.",
};

/**
 * Bulk upload: a CSV file or a Google Sheet's link, a ticket for everyone
 * in it, and whether to email their passes. Check shows every row with what
 * would happen to it; Import adds the good ones. Passes then go out ten at
 * a time, with progress, so a big import never times out.
 */
export function ImportPanel({
	eventId,
	open,
	fields,
	tickets,
	emailReady,
	onClose,
	onDone,
	onBack,
}: {
	eventId: string;
	open: boolean;
	fields: FormField[];
	tickets: Ticket[];
	emailReady: boolean;
	onClose: () => void;
	/** After an import: what to say about it. */
	onDone: (summary: string) => void;
	/**
	 * Opened from Invite a guest: Back returns there. Left out, Back closes.
	 */
	onBack?: (() => void) | undefined;
}) {
	const id = useId();
	const ref = useModalDialog(open);
	const [mode, setMode] = useState<"file" | "sheet">("file");
	const [fileText, setFileText] = useState<string | null>(null);
	const [fileName, setFileName] = useState("");
	const [sheetUrl, setSheetUrl] = useState("");
	const [ticketId, setTicketId] = useState(tickets[0]?.id ?? "");
	const [emailPass, setEmailPass] = useState(true);
	const [preview, setPreview] = useState<Extract<
		ImportPreview,
		{ ok: true }
	> | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [confirm, setConfirm] = useState<string | null>(null);
	const [progress, setProgress] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const [dragging, setDragging] = useState(false);

	// Each opening starts clean.
	useEffect(() => {
		if (!open) return;
		setFileText(null);
		setFileName("");
		setSheetUrl("");
		setPreview(null);
		setMessage(null);
		setConfirm(null);
		setProgress(null);
		setTicketId(tickets[0]?.id ?? "");
	}, [open, tickets]);

	// A file or link chosen and not yet imported (or importing right now):
	// asked about before the panel closes.
	const guard = useCloseGuard(
		ref,
		fileText !== null || sheetUrl.trim() !== "",
		{
			title: "Discard this upload?",
			body: "Nobody has been added from it yet. Keep going, or discard it and close.",
		},
	);

	const source: ImportSource | null =
		mode === "file"
			? fileText === null
				? null
				: { kind: "csv", text: fileText }
			: sheetUrl.trim()
				? { kind: "sheet", url: sheetUrl.trim() }
				: null;

	async function readFile(file: File | undefined) {
		setPreview(null);
		setMessage(null);
		if (!file) return;
		if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
			setMessage(
				"Choose a .csv file. From Excel or Numbers: File → Save as / Export → CSV.",
			);
			return;
		}
		if (file.size > IMPORT_TEXT_LIMIT) {
			setMessage("That file is too large: up to about 1 MB.");
			return;
		}
		setFileName(file.name);
		setFileText(await file.text());
	}

	function check() {
		if (!source) return;
		setConfirm(null);
		setMessage(null);
		startTransition(async () => {
			const result = await previewImport(eventId, source, ticketId).catch(
				() => FAILED,
			);
			if (!result.ok) {
				setPreview(null);
				setMessage(result.message);
				return;
			}
			setPreview(result);
		});
	}

	function run(force: boolean) {
		if (!source) return;
		setMessage(null);
		startTransition(async () => {
			const result = await importGuests(eventId, source, ticketId, force).catch(
				() => FAILED,
			);
			if (!result.ok) {
				if (result.confirm) setConfirm(result.message);
				else setMessage(result.message);
				return;
			}
			setConfirm(null);
			let summary = `Imported ${result.ids.length} ${result.ids.length === 1 ? "guest" : "guests"}${result.skipped ? `; ${result.skipped} skipped` : ""}.`;
			if (emailReady && emailPass) {
				let sent = 0;
				const failed: string[] = [];
				for (let i = 0; i < result.ids.length; i += 10) {
					setProgress(
						`Emailing passes: ${Math.min(i + 10, result.ids.length)} of ${result.ids.length}`,
					);
					const batch = await sendPasses(
						eventId,
						result.ids.slice(i, i + 10),
					).catch(() => FAILED);
					if (!batch.ok) {
						failed.push(batch.message);
						break;
					}
					sent += batch.sent;
					failed.push(...batch.failed.map((f) => `${f.name}: ${f.reason}`));
				}
				setProgress(null);
				summary += ` ${sent} ${sent === 1 ? "pass" : "passes"} emailed.`;
				if (failed.length)
					summary += ` Not emailed: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}`;
			}
			ref.current?.close();
			onDone(summary);
		});
	}

	function downloadTemplate() {
		const blob = new Blob([`﻿${csvLine(templateHeader(fields))}`], {
			type: "text/csv;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "guests-template.csv";
		link.click();
		URL.revokeObjectURL(url);
	}

	const bad = preview ? preview.rows.filter((r) => r.problem) : [];

	return (
		<dialog
			ref={ref}
			className={styles.panel}
			aria-labelledby={`${id}title`}
			onClose={ownClose(onClose)}
			{...guard.dialogProps}
		>
			<div className={styles.panelInner}>
				<header className={styles.panelHead}>
					<div className={styles.panelHeadStart}>
						{onBack ? (
							<button
								type="button"
								className={styles.iconButton}
								onClick={() => guard.requestClose(onBack)}
							>
								<RightIcon className={styles.flip} />
								<span className={styles.srOnly}>Back to Invite a guest</span>
							</button>
						) : null}
						<h3 className={styles.panelTitle} id={`${id}title`}>
							Bulk upload
						</h3>
					</div>
					<button
						type="button"
						className={styles.iconButton}
						onClick={() => guard.requestClose()}
					>
						<CloseIcon />
						<span className={styles.srOnly}>Close</span>
					</button>
				</header>

				<div className={styles.panelBody}>
					<fieldset className={styles.segmented}>
						<legend className={styles.srOnly}>Where the guests are</legend>
						{(["file", "sheet"] as const).map((value) => (
							<label key={value} className={styles.segment}>
								<input
									type="radio"
									name={`${id}mode`}
									checked={mode === value}
									onChange={() => {
										setMode(value);
										setPreview(null);
										setMessage(null);
									}}
								/>
								{value === "file" ? "CSV file" : "Google Sheet"}
							</label>
						))}
					</fieldset>

					{mode === "file" ? (
						<label
							className={styles.drop}
							data-dragging={dragging || undefined}
							onDragOver={(event) => {
								event.preventDefault();
								setDragging(true);
							}}
							onDragLeave={() => setDragging(false)}
							onDrop={(event) => {
								event.preventDefault();
								setDragging(false);
								void readFile(event.dataTransfer.files[0]);
							}}
						>
							<UploadIcon />
							<span className={styles.dropTitle}>
								{fileName || "Drop a CSV here, or choose one"}
							</span>
							<span className={styles.formHint}>
								First row: the column names. One guest per row after it.
							</span>
							<input
								className={styles.srOnly}
								type="file"
								accept=".csv,text/csv"
								onChange={(event) => void readFile(event.target.files?.[0])}
							/>
						</label>
					) : (
						<label className={styles.formRow}>
							<span className={styles.formLabel}>Sheet link</span>
							<input
								className={styles.codeInput}
								type="url"
								inputMode="url"
								placeholder="https://docs.google.com/spreadsheets/d/…"
								value={sheetUrl}
								onChange={(event) => {
									setSheetUrl(event.target.value);
									setPreview(null);
								}}
							/>
							<span className={styles.formHint}>
								Share it as "Anyone with the link can view". The tab in the link
								is the one read.
							</span>
						</label>
					)}

					<button
						type="button"
						className={styles.textLink}
						onClick={downloadTemplate}
					>
						<DownloadIcon /> Download a template with your form's questions
					</button>

					<label className={styles.formRow}>
						<span className={styles.formLabel}>Ticket for everyone in it</span>
						<select
							className={styles.select}
							value={ticketId}
							onChange={(event) => {
								setTicketId(event.target.value);
								setPreview(null);
							}}
						>
							{tickets.map((ticket) => (
								<option key={ticket.id} value={ticket.id}>
									{ticket.name}
								</option>
							))}
						</select>
					</label>

					{emailReady ? (
						<label className={styles.switchRow}>
							<input
								type="checkbox"
								checked={emailPass}
								onChange={(event) => setEmailPass(event.target.checked)}
							/>
							<span>
								Email their passes
								<span className={styles.formHint}>
									Each guest gets their QR and ticket code
								</span>
							</span>
						</label>
					) : (
						<p className={styles.formNote}>
							Emailing passes isn't set up yet; guests are added with their
							codes.
						</p>
					)}

					{preview ? (
						<section
							className={styles.preview}
							aria-label="What the import will do"
						>
							<p className={styles.previewSummary}>
								<strong>{preview.good}</strong>{" "}
								{preview.good === 1 ? "guest" : "guests"} can be added
								{bad.length ? `, ${bad.length} can't` : ""}.
							</p>
							{preview.missing.length > 0 ? (
								<p className={styles.fieldError}>
									No column for: {preview.missing.join(", ")}. Add it to the
									file, or every row fails it.
								</p>
							) : null}
							<ul className={styles.columnMap}>
								{preview.columns.map((c, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: columns are positional; two can share a header
									<li key={i} data-ignored={c.question ? undefined : true}>
										<span>{c.header || "(no header)"}</span>
										<span aria-hidden="true">→</span>
										<span>{c.question ?? "ignored"}</span>
									</li>
								))}
							</ul>
							{bad.length > 0 ? (
								<table className={styles.previewTable}>
									<caption className={styles.srOnly}>
										Rows that can't be added
									</caption>
									<thead>
										<tr>
											<th scope="col">Row</th>
											<th scope="col">Guest</th>
											<th scope="col">Why not</th>
										</tr>
									</thead>
									<tbody>
										{bad.slice(0, SHOWN_ROWS).map((row) => (
											<tr key={row.line}>
												<td>{row.line}</td>
												<td>{row.name || row.email || "—"}</td>
												<td>{row.problem}</td>
											</tr>
										))}
									</tbody>
								</table>
							) : null}
							{bad.length > SHOWN_ROWS ? (
								<p className={styles.formHint}>
									And {bad.length - SHOWN_ROWS} more.
								</p>
							) : null}
						</section>
					) : null}
				</div>

				<footer className={styles.panelFoot}>
					{message || confirm || progress ? (
						<div className={styles.formResult} role="alert">
							<p>{progress ?? confirm ?? message}</p>
							{confirm && !progress ? (
								<button
									type="button"
									className={styles.primary}
									disabled={pending}
									onClick={() => run(true)}
								>
									Import anyway
								</button>
							) : null}
						</div>
					) : null}
					<div className={styles.footActions}>
						<button
							type="button"
							className={styles.secondary}
							onClick={() => guard.requestClose(onBack)}
						>
							Back
						</button>
						{preview && preview.good > 0 ? (
							<button
								type="button"
								className={styles.primary}
								disabled={pending}
								aria-busy={pending || undefined}
								onClick={() => run(false)}
							>
								{pending
									? "Importing…"
									: `Import ${preview.good} ${preview.good === 1 ? "guest" : "guests"}`}
							</button>
						) : (
							<button
								type="button"
								className={styles.primary}
								disabled={pending || !source || !ticketId}
								aria-busy={pending || undefined}
								onClick={check}
							>
								{pending ? "Checking…" : "Check the file"}
							</button>
						)}
					</div>
				</footer>
			</div>
			{guard.popup}
		</dialog>
	);
}
