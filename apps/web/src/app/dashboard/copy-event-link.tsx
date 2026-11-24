"use client";

import { useEffect, useRef, useState } from "react";
import { LinkIcon, TickIcon } from "@/components/icons";
import styles from "./events.module.css";

/**
 * Copies the event's public link. An icon on screen, so the result is said
 * twice: the icon turns into a tick, and a live region reads it out. The
 * label does not change, so the button's accessible name stays what it does.
 */
export function CopyEventLink({ url, title }: { url: string; title: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			// Refused clipboard access still leaves the link one click away on
			// the event's own page; nothing here can do better.
			return;
		}
		setCopied(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 2000);
	}

	return (
		<>
			<button
				type="button"
				className={styles.action}
				onClick={copy}
				title="Copy link"
			>
				<span className={styles.srOnly}>Copy link to {title}</span>
				{copied ? <TickIcon className={styles.copiedIcon} /> : <LinkIcon />}
			</button>
			<span className={styles.srOnly} aria-live="polite">
				{copied ? "Link copied" : ""}
			</span>
		</>
	);
}
