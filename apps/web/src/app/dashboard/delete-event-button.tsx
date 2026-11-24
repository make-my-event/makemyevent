"use client";

import { useState, useTransition } from "react";
import { TrashIcon } from "@/components/icons";
import dialog from "./create-event.module.css";
import { deleteEvent } from "./delete-event-action";
import styles from "./events.module.css";
import { Popup } from "./popup";

/**
 * The card's bin. Deleting cannot be undone, so it asks first and says what
 * goes with the event; the destructive button is never the default.
 */
export function DeleteEventButton({
	eventId,
	title,
}: {
	eventId: string;
	title: string;
}) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	return (
		<>
			<button
				type="button"
				className={`${styles.action} ${styles.actionDestructive}`}
				aria-haspopup="dialog"
				title="Delete"
				onClick={() => {
					setError(null);
					setOpen(true);
				}}
			>
				<span className={styles.srOnly}>Delete {title}</span>
				<TrashIcon />
			</button>
			<Popup
				open={open}
				onClose={() => setOpen(false)}
				title="Delete this event?"
			>
				<p className={dialog.lead}>
					“{title}” and its tickets, invites and team are deleted for good. This
					cannot be undone.
				</p>
				{error ? (
					<p className={styles.deleteError} role="alert">
						{error}
					</p>
				) : null}
				<div className={dialog.actions}>
					<button
						type="button"
						className={dialog.secondary}
						onClick={() => setOpen(false)}
						disabled={pending}
					>
						Cancel
					</button>
					<button
						type="button"
						className={`${dialog.secondary} ${dialog.discard}`}
						disabled={pending}
						aria-busy={pending || undefined}
						onClick={() =>
							startTransition(async () => {
								const result = await deleteEvent(eventId);
								if (result.ok) setOpen(false);
								else setError(result.message);
							})
						}
					>
						{pending ? "Deleting…" : "Delete event"}
					</button>
				</div>
			</Popup>
		</>
	);
}
