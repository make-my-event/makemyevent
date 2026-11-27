"use client";

import { CopyIcon, TickIcon } from "@/components/icons";
import { useCopy } from "@/components/ui/use-copy";
import styles from "./ticket.module.css";

/**
 * The ticket code and its Copy: the word turns to "Copied" for two seconds,
 * and a live region says so; the button's name stays "Copy ticket code".
 */
export function CopyCode({ code }: { code: string }) {
	const { copied, copy } = useCopy();
	return (
		<div className={styles.codeRow}>
			<output className={styles.code}>{code}</output>
			<button
				type="button"
				className={styles.copy}
				onClick={() => copy(code)}
				aria-label="Copy ticket code"
			>
				{copied ? <TickIcon /> : <CopyIcon />}
				<span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
			</button>
			<span className={styles.srOnly} aria-live="polite">
				{copied ? "Ticket code copied" : ""}
			</span>
		</div>
	);
}
