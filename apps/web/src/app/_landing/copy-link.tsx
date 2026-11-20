"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../landing.module.css";

/** Copies the sample event link, and says so afterwards. */
export function CopyLink({ url }: { url: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(`https://${url}`);
		} catch {
			// Clipboard access can be refused; the message below still tells
			// the person what happened.
		}
		setCopied(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className={styles.copyRow}>
			<button
				type="button"
				className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
				onClick={copy}
			>
				{copied ? "Link copied" : "Copy link"}
			</button>
			<span className={styles.note} aria-live="polite">
				{copied
					? "Copied to your clipboard."
					: "For the poster, the group chat and the bio."}
			</span>
		</div>
	);
}
