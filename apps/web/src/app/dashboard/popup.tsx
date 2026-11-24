"use client";

import { CloseIcon } from "@/components/icons";
import { useId } from "react";
import ui from "@/components/ui/ui.module.css";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import dialog from "./create-event.module.css";

/**
 * A popup with a heading and a Close button, drawn like Create Event so every
 * dialog in the dashboard looks the same. Native <dialog> with showModal():
 * the browser traps focus, Escape closes it, and focus goes back to the
 * button that opened it.
 */
export function Popup({
	open,
	onClose,
	title,
	children,
	className,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	/**
	 * The popup's own size, in place of Create Event's: a class that sets
	 * width (and, for long content, overflow). The frame stays the shared one.
	 */
	className?: string | undefined;
}) {
	// Opened and closed from the open prop, so the caller can close it after
	// a save; Escape, Close and the backdrop close it from inside.
	const ref = useModalDialog(open);
	const titleId = useId();

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: the click only closes on a backdrop press; Escape is the keyboard's way out, built into <dialog>
		<dialog
			ref={ref}
			className={className ? `${ui.dialog} ${className}` : dialog.dialog}
			aria-labelledby={titleId}
			onClose={ownClose(onClose)}
			// A press on the backdrop (the dialog itself, outside its panel) closes it.
			onClick={(event) => {
				if (event.target === event.currentTarget) ref.current?.close();
			}}
		>
			{open ? (
				<div className={dialog.panel}>
					<div className={dialog.head}>
						<h2 className={dialog.title} id={titleId}>
							{title}
						</h2>
						<button
							type="button"
							className={dialog.close}
							onClick={() => ref.current?.close()}
						>
							<span className={dialog.srOnly}>Close</span>
							<CloseIcon />
						</button>
					</div>
					{children}
				</div>
			) : null}
		</dialog>
	);
}
