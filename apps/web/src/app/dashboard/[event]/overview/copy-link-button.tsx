"use client";

import { CopyIcon, TickIcon } from "@/components/icons";
import styles from "./share-card.module.css";
import { useCopy } from "./use-copy";

/**
 * The Share card's Copy. Its word turns to "Copied" for two seconds, and a
 * live region says so for screen readers; the button's name stays "Copy
 * link", what it does.
 */
export function CopyLinkButton({ url }: { url: string }) {
	const { copied, copy } = useCopy();

	return (
		<>
			<button
				type="button"
				className={styles.button}
				onClick={() => copy(url)}
				aria-label="Copy link"
			>
				{copied ? <TickIcon className={styles.done} /> : <CopyIcon />}
				<span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
			</button>
			<span className={styles.srOnly} aria-live="polite">
				{copied ? "Link copied" : ""}
			</span>
		</>
	);
}
