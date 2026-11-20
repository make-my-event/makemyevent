"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A disclosure that closes the way people expect: Escape, a pointer press
 * outside it, and focus leaving it.
 *
 * Both header disclosures — the account panel and the visitor menu — need the
 * same three, so they share this rather than each growing its own copy.
 *
 * It is deliberately not a `role="menu"`. The contents are links, and a menu
 * role would promise arrow-key semantics that links do not have; a disclosure
 * gets Tab, Enter and Escape for free from the browser.
 */
export function useDisclosure() {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!open) return;

		// Escape closes and hands focus back, so a keyboard is never left
		// standing on a control that is no longer on screen.
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			buttonRef.current?.focus();
		};

		// Pointerdown rather than click: the panel must be gone before the
		// thing underneath reacts.
		const onPointerDown = (event: PointerEvent) => {
			if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
		};

		// Tabbing out closes it too: the panel has no business hanging over
		// the page once focus has moved on.
		const onFocusOut = (event: FocusEvent) => {
			const next = event.relatedTarget as Node | null;
			if (!next || !wrapRef.current?.contains(next)) setOpen(false);
		};

		const wrap = wrapRef.current;
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointerDown);
		wrap?.addEventListener("focusout", onFocusOut);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointerDown);
			wrap?.removeEventListener("focusout", onFocusOut);
		};
	}, [open]);

	return { open, setOpen, wrapRef, buttonRef };
}
