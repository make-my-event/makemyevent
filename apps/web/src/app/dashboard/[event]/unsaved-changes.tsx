"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
// The same popup materials as Create Event, so every dialog in the
// dashboard is drawn alike.
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import dialog from "../create-event.module.css";
import { usePendingNav } from "../pending-nav-context";

/** What a section with unsaved edits hands the guard: how to save them. */
type Pending = {
	/** Saves the section. Resolves false when it could not, e.g. a field is invalid. */
	save: () => Promise<boolean>;
};

type Registry = { set: (pending: Pending | null) => void };

const GuardContext = createContext<Registry | null>(null);

/**
 * Asks before anyone leaves a section with unsaved edits in it.
 *
 * A section reports its state with `useUnsavedChanges`. While it has edits:
 *
 * - Any link on the page (the sidebar, the header, a link inside the
 *   section) opens a popup instead of leaving: Save changes, Discard, or
 *   Keep editing. Save runs the section's own save and then goes on; if the
 *   save fails, it stays, so the section can show what is wrong.
 * - Reloading, closing the tab, or typing another address gets the
 *   browser's own "Leave site?" prompt. Browsers do not let a page word that
 *   prompt or offer Save in it, so there it is leave or stay.
 *
 * Links are caught on the window in the capture phase, before Next's Link
 * handler and before the dashboard's pending-move handler (on the document)
 * run, so one guard covers every link, Link or plain <a>, without each one
 * opting in, and a held press shows no skeleton. Links that open elsewhere (new tab, download, modifier
 * keys, another site) are left alone: they do not leave this page.
 *
 * Not covered: the browser's back and forward buttons. Next.js offers no way
 * to hold a history move inside the app, and working around it means
 * rewriting the history stack. The tab-close prompt still guards everything
 * that leaves the site.
 */
export function UnsavedChangesGuard({
	children,
}: {
	children: React.ReactNode;
}) {
	const { navigate } = usePendingNav();
	const pendingRef = useRef<Pending | null>(null);
	const [destination, setDestination] = useState<string | null>(null);
	// Shown once a destination is held; the browser puts focus back on the
	// link afterwards.
	const dialogRef = useModalDialog(destination !== null);
	const [saving, setSaving] = useState(false);
	const titleId = useId();
	const bodyId = useId();

	const registry = useMemo<Registry>(
		() => ({
			set: (pending) => {
				pendingRef.current = pending;
			},
		}),
		[],
	);

	// Leaving the site, reloading, closing the tab.
	useEffect(() => {
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!pendingRef.current) return;
			event.preventDefault();
			// Older browsers need returnValue set to show the prompt.
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, []);

	// Every link inside the app.
	useEffect(() => {
		const onClick = (event: MouseEvent) => {
			if (!pendingRef.current) return;
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
				return;
			const target = event.target;
			if (!(target instanceof Element)) return;
			const link = target.closest<HTMLAnchorElement>("a[href]");
			if (!link) return;
			if (link.target && link.target !== "_self") return;
			if (link.hasAttribute("download")) return;

			const url = new URL(link.href, window.location.href);
			// Another site is a full page load; the tab-close prompt has it.
			if (url.origin !== window.location.origin) return;
			// A jump within this page loses nothing.
			if (
				url.pathname === window.location.pathname &&
				url.search === window.location.search
			)
				return;

			event.preventDefault();
			event.stopPropagation();
			setDestination(`${url.pathname}${url.search}${url.hash}`);
		};
		window.addEventListener("click", onClick, true);
		return () => window.removeEventListener("click", onClick, true);
	}, []);

	// Save is what most people want, so it takes focus.
	useEffect(() => {
		if (destination)
			dialogRef.current
				?.querySelector<HTMLButtonElement>("[data-save]")
				?.focus();
	}, [destination, dialogRef]);

	const stay = useCallback(() => dialogRef.current?.close(), [dialogRef]);

	const go = useCallback(
		(to: string) => {
			pendingRef.current = null;
			dialogRef.current?.close();
			navigate(to);
		},
		[navigate, dialogRef],
	);

	async function saveAndGo() {
		const pending = pendingRef.current;
		if (!destination || !pending) return;
		setSaving(true);
		const saved = await pending.save().catch(() => false);
		setSaving(false);
		if (saved) go(destination);
		else stay();
	}

	return (
		<GuardContext.Provider value={registry}>
			{children}

			<dialog
				ref={dialogRef}
				className={dialog.dialog}
				aria-labelledby={titleId}
				aria-describedby={bodyId}
				onClose={ownClose(() => setDestination(null))}
			>
				<div className={dialog.panel}>
					<h2 className={dialog.title} id={titleId}>
						Save your changes?
					</h2>
					<p className={dialog.lead} id={bodyId}>
						This section has changes that are not saved yet. Save them before
						you go, or discard them.
					</p>
					<div className={dialog.actions}>
						<button
							type="button"
							className={dialog.secondary}
							onClick={stay}
							disabled={saving}
						>
							Keep editing
						</button>
						<button
							type="button"
							className={`${dialog.secondary} ${dialog.discard}`}
							onClick={() => destination && go(destination)}
							disabled={saving}
						>
							Discard
						</button>
						<button
							type="button"
							className={dialog.primary}
							data-save
							onClick={saveAndGo}
							disabled={saving}
							aria-busy={saving || undefined}
						>
							{saving ? "Saving…" : "Save changes"}
						</button>
					</div>
				</div>
			</dialog>
		</GuardContext.Provider>
	);
}

/**
 * For a section: report whether it has unsaved edits, and how to save them.
 *
 *   const [draft, setDraft] = useState(saved);
 *   useUnsavedChanges(!equal(draft, saved), () => saveSection(draft));
 *
 * `save` resolves true once saved. The section clears its own edits on
 * success, which turns `dirty` false and stands the guard down.
 */
export function useUnsavedChanges(
	dirty: boolean,
	save: () => Promise<boolean>,
) {
	const registry = useContext(GuardContext);
	const saveRef = useRef(save);

	useEffect(() => {
		saveRef.current = save;
	}, [save]);

	useEffect(() => {
		if (!registry) return;
		registry.set(dirty ? { save: () => saveRef.current() } : null);
		return () => registry.set(null);
	}, [registry, dirty]);
}
