"use client";

import { useEffect, useRef } from "react";

/**
 * A native <dialog> shown as a modal while `open` is true, and closed when it
 * turns false. showModal() gives the WAI-ARIA modal pattern for free: focus
 * is held inside, the page behind is inert, Escape closes it, and focus goes
 * back to what opened it.
 *
 *   const ref = useModalDialog(open);
 *   <dialog ref={ref} onClose={() => setOpen(false)}>…</dialog>
 *
 * Anything that closes it from inside (Escape, a Close button calling
 * ref.current?.close()) fires onClose, which is where `open` goes false.
 */
export function useModalDialog(open: boolean) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	}, [open]);
	return ref;
}

/**
 * A dialog's own close, not one shown inside it: a <dialog>'s close event
 * reaches the dialogs around it in React, so a popup closing inside a panel
 * would close the panel too. Every dialog's onClose goes through this.
 *
 *   <dialog onClose={ownClose(() => setOpen(false))}>
 */
export function ownClose(handler: () => void) {
	return (event: React.SyntheticEvent<HTMLDialogElement>) => {
		if (event.target === event.currentTarget) handler();
	};
}

/**
 * A press on the backdrop, outside the dialog's box. A side panel fills its
 * own box edge to edge, so the press is told by where it lands, not only by
 * its target.
 *
 *   <dialog onClick={(e) => isBackdropClick(e) && ref.current?.close()}>
 */
export function isBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
	if (event.target !== event.currentTarget) return false;
	const box = event.currentTarget.getBoundingClientRect();
	return (
		event.clientX < box.left ||
		event.clientX > box.right ||
		event.clientY < box.top ||
		event.clientY > box.bottom
	);
}
