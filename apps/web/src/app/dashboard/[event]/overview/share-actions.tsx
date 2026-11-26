"use client";

import { escapeHtml } from "@/lib/text";
import { useId, useState } from "react";
import dialog from "../../create-event.module.css";
import { CopyIcon, QrIcon, TickIcon } from "@/components/icons";
import { Popup } from "../../popup";
import styles from "./share-card.module.css";
import { useCopy } from "@/components/ui/use-copy";

/** A file name from the event's title: "Unwind Circle!" → "unwind-circle". */
function fileNameOf(title: string): string {
	return (
		title
			.normalize("NFKD")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "event"
	);
}

function download(blob: Blob, name: string) {
	const href = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = href;
	link.download = name;
	link.click();
	// After the click has been handled; revoking at once can cancel it.
	window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** The PNG's edge in pixels: sharp on a poster, still small as a file. */
const PNG_SIZE = 1024;

/** Draws the SVG onto a canvas, square edges kept square. */
function svgToPng(svg: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = PNG_SIZE;
			canvas.height = PNG_SIZE;
			const context = canvas.getContext("2d");
			if (!context) return reject(new Error("No canvas"));
			context.imageSmoothingEnabled = false;
			context.drawImage(image, 0, 0, PNG_SIZE, PNG_SIZE);
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))),
				"image/png",
			);
		};
		image.onerror = () => reject(new Error("SVG did not load"));
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
}

/** QR: the event's link as a code to show on screen or download for print. */
export function QrButton({ svg, title }: { svg: string; title: string }) {
	const [open, setOpen] = useState(false);
	const name = fileNameOf(title);

	return (
		<>
			<button
				type="button"
				className={styles.button}
				aria-haspopup="dialog"
				onClick={() => setOpen(true)}
			>
				<QrIcon />
				QR
			</button>
			<Popup open={open} onClose={() => setOpen(false)} title="QR code">
				<p className={dialog.lead}>
					Scanning it opens the event page. Put it on posters, slides or a table
					at the entrance.
				</p>
				{/* biome-ignore lint/performance/noImgElement: generated SVG in a data URL, not an asset next/image can serve */}
				<img
					className={styles.qr}
					src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
					alt={`QR code for ${title}`}
					width={240}
					height={240}
				/>
				<div className={dialog.actions}>
					<button
						type="button"
						className={dialog.secondary}
						onClick={() =>
							download(
								new Blob([svg], { type: "image/svg+xml" }),
								`${name}-qr.svg`,
							)
						}
					>
						Download SVG
					</button>
					<button
						type="button"
						className={dialog.primary}
						onClick={async () => {
							try {
								download(await svgToPng(svg), `${name}-qr.png`);
							} catch {
								// A browser that cannot draw it still has the SVG beside it.
							}
						}}
					>
						Download PNG
					</button>
				</div>
			</Popup>
		</>
	);
}

/**
 * The HTML another site pastes in: one link, styled inline so it needs no
 * stylesheet and no script from us. Paper on stamp, from design-spec.md
 * (4.92:1); it sits on someone else's page, so it cannot use our tokens.
 */
function embedSnippet(url: string, title: string): string {
	return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#1f7a4d;color:#f7f6f2;font:500 16px/1.2 system-ui,sans-serif;text-decoration:none">Register for ${escapeHtml(title)}</a>`;
}

/** <>: a ready-made button for the host's own website. */
export function EmbedButton({ url, title }: { url: string; title: string }) {
	const [open, setOpen] = useState(false);
	const { copied, copy } = useCopy();
	const codeId = useId();
	const snippet = embedSnippet(url, title);

	return (
		<>
			<button
				type="button"
				className={`${styles.button} ${styles.iconButton}`}
				aria-haspopup="dialog"
				title="Embed on your website"
				onClick={() => setOpen(true)}
			>
				<span aria-hidden="true">&lt;&gt;</span>
				<span className={styles.srOnly}>Embed on your website</span>
			</button>
			<Popup
				open={open}
				onClose={() => setOpen(false)}
				title="Embed on your website"
			>
				<p className={dialog.lead}>
					Paste this into your site's HTML. It adds a button that opens the
					event page, with no script and nothing loaded from us.
				</p>
				<div className={styles.preview}>
					{/* The snippet itself, drawn the same way, so what you see is what they get. */}
					<span className={styles.previewButton}>Register for {title}</span>
				</div>
				<label className={styles.codeLabel} htmlFor={codeId}>
					HTML
				</label>
				<textarea
					id={codeId}
					className={styles.code}
					value={snippet}
					readOnly
					rows={4}
					spellCheck={false}
					onFocus={(event) => event.currentTarget.select()}
				/>
				<div className={dialog.actions}>
					<button
						type="button"
						className={dialog.primary}
						onClick={() => copy(snippet)}
					>
						{copied ? <TickIcon /> : <CopyIcon />}
						<span className={styles.gap}>
							{copied ? "Copied" : "Copy code"}
						</span>
					</button>
					<span className={styles.srOnly} aria-live="polite">
						{copied ? "Code copied" : ""}
					</span>
				</div>
			</Popup>
		</>
	);
}
