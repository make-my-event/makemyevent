"use client";

import { useState } from "react";
import { QrIcon } from "@/components/icons";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import styles from "./ticket.module.css";

/**
 * "Show code to scan": the entry code large, over the page, for the door.
 * The pass's own code is small on a phone; this one is sized for a scanner.
 * The SVG is the server's, drawn from a token it signed.
 */
export function ShowCode({
	svg,
	code,
	name,
}: {
	svg: string;
	code: string;
	name: string;
}) {
	const [open, setOpen] = useState(false);
	const ref = useModalDialog(open);
	return (
		<>
			<button
				type="button"
				className={styles.show}
				onClick={() => setOpen(true)}
			>
				<QrIcon />
				Show code to scan
			</button>
			<dialog
				ref={ref}
				className={styles.dialog}
				aria-label="Entry code"
				onClose={ownClose(() => setOpen(false))}
			>
				<div className={styles.dialogBody}>
					<div
						className={styles.qr}
						role="img"
						aria-label={`Entry code for ${name}`}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: a QR the server drew from a token it signed; no guest text in it
						dangerouslySetInnerHTML={{ __html: svg }}
					/>
					<p className={styles.dialogCode}>{code}</p>
					<button
						type="button"
						className={styles.close}
						onClick={() => ref.current?.close()}
					>
						Close
					</button>
				</div>
			</dialog>
		</>
	);
}
