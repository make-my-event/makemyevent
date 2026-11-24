"use client";

import { type RefObject, useState } from "react";
import { isBackdropClick } from "@/components/ui/use-modal-dialog";
import { Popup } from "../../popup";
import styles from "./guests.module.css";

type Copy = {
	title: string;
	body: string;
	/** The panel's own save, offered beside Discard; left out, only Discard. */
	save?: { label: string; run: () => void } | undefined;
};

/**
 * Closing a panel that may hold work: a press outside it, Escape, Close or
 * Back all come here. With nothing unsaved it closes at once; otherwise it
 * asks first: Keep editing, Discard, or the panel's own save.
 *
 *   const guard = useCloseGuard(ref, dirty, copy);
 *   <dialog ref={ref} {...guard.dialogProps}>… {guard.popup}</dialog>
 *   <button onClick={() => guard.requestClose()}>Close</button>
 *
 * requestClose takes what to do once closed, such as opening another panel.
 */
export function useCloseGuard(
	ref: RefObject<HTMLDialogElement | null>,
	dirty: boolean,
	copy: Copy,
) {
	const [asking, setAsking] = useState<{
		then?: (() => void) | undefined;
	} | null>(null);

	function requestClose(then?: () => void) {
		if (dirty) {
			setAsking({ then });
			return;
		}
		ref.current?.close();
		then?.();
	}

	const dialogProps = {
		// Escape: held while there is work, so it can be asked about.
		onCancel: (event: React.SyntheticEvent<HTMLDialogElement>) => {
			if (event.target !== event.currentTarget || !dirty) return;
			event.preventDefault();
			setAsking({});
		},
		onClick: (event: React.MouseEvent<HTMLDialogElement>) => {
			if (isBackdropClick(event)) requestClose();
		},
	};

	const popup = (
		<Popup
			open={asking !== null}
			onClose={() => setAsking(null)}
			title={copy.title}
		>
			<p className={styles.popupText}>{copy.body}</p>
			<div className={styles.footActions}>
				<button
					type="button"
					className={styles.secondary}
					onClick={() => setAsking(null)}
				>
					Keep editing
				</button>
				<button
					type="button"
					className={styles.secondary}
					onClick={() => {
						const then = asking?.then;
						setAsking(null);
						ref.current?.close();
						then?.();
					}}
				>
					Discard
				</button>
				{copy.save ? (
					<button
						type="button"
						className={styles.primary}
						onClick={() => {
							setAsking(null);
							copy.save?.run();
						}}
					>
						{copy.save.label}
					</button>
				) : null}
			</div>
		</Popup>
	);

	return { requestClose, dialogProps, popup };
}
