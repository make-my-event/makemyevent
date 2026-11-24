"use client";

import { TickIcon } from "@/components/icons";
import styles from "./ui.module.css";

export type SaveMessage =
	| { tone: "error"; text: React.ReactNode }
	| { tone: "plain"; text: React.ReactNode }
	| { tone: "saved" };

/**
 * The bar held at the foot of a section that saves as a whole: what state
 * the edits are in, and, while there are edits, Discard and Save changes.
 * The status line is a polite live region, so a screen reader hears
 * "Saved" or the error without moving focus.
 */
export function SaveBar({
	message,
	dirty,
	pending,
	canSave = true,
	onDiscard,
	onSave,
	className,
}: {
	message: SaveMessage;
	dirty: boolean;
	pending: boolean;
	/** False while saving cannot work (offline): the reason is the message. */
	canSave?: boolean;
	onDiscard: () => void;
	onSave: () => void;
	className?: string | undefined;
}) {
	return (
		<section
			className={className ? `${styles.saveBar} ${className}` : styles.saveBar}
			aria-label="Save changes"
		>
			<p className={styles.saveStatus} aria-live="polite">
				{message.tone === "saved" ? (
					<span className={styles.saved}>
						<TickIcon /> Saved
					</span>
				) : message.tone === "error" ? (
					<span className={styles.saveError}>{message.text}</span>
				) : (
					message.text
				)}
			</p>
			{dirty ? (
				<div className={styles.saveActions}>
					<button
						type="button"
						className={styles.secondary}
						disabled={pending}
						onClick={onDiscard}
					>
						Discard
					</button>
					<button
						type="button"
						className={styles.primary}
						disabled={pending || !canSave}
						aria-busy={pending || undefined}
						onClick={onSave}
					>
						{pending ? "Saving…" : "Save changes"}
					</button>
				</div>
			) : null}
		</section>
	);
}
