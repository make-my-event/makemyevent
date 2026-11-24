"use client";

import { ChevronDownIcon } from "@/components/icons";
import Link from "next/link";
import { useId } from "react";
import type { Workspace } from "./types";
import styles from "./toolbar.module.css";
import { useDisclosure } from "@/components/use-disclosure";

/**
 * The first control in the toolbar: whose events are on screen, and the way
 * to the others.
 *
 * A disclosure, not a `role="menu"` — the same reasoning as the header's two
 * panels, which is why it borrows their hook rather than growing a third copy
 * of Escape, outside-press and focus-out.
 *
 * The rows are links. Each workspace is a URL, so one can be opened in a new
 * tab and reloaded. The panel itself needs script to open.
 */
export function WorkspaceSwitcher({
	workspaces,
	activeId,
}: {
	workspaces: readonly Workspace[];
	activeId: string;
}) {
	const panelId = useId();
	const { open, setOpen, wrapRef, buttonRef } = useDisclosure();
	const active = workspaces.find((space) => space.id === activeId);

	return (
		<div className={styles.switcher} ref={wrapRef}>
			<button
				type="button"
				ref={buttonRef}
				className={styles.chip}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((value) => !value)}
			>
				<span className={styles.dot} aria-hidden="true" />
				<span className={styles.srOnly}>Workspace:</span>
				<span className={styles.chipName}>{active?.name ?? "Your events"}</span>
				<ChevronDownIcon className={styles.chevron} />
			</button>

			<div className={styles.panel} id={panelId} hidden={!open}>
				<p className={styles.panelLabel}>Workspaces</p>

				{workspaces.map((space) => {
					const current = space.id === activeId;
					return (
						<Link
							key={space.id}
							className={styles.panelItem}
							href={space.href}
							aria-current={current ? "true" : undefined}
							onClick={() => setOpen(false)}
						>
							<span className={styles.panelItemName}>{space.name}</span>
							{current ? (
								<svg
									className={styles.tick}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="m20 6-11 11-5-5" />
								</svg>
							) : null}
						</Link>
					);
				})}

				{/* An organization is how a team shares one set of events. Until
				    someone needs that, their own workspace is the only row above. */}
				<div className={styles.panelAdd}>
					{/* Not built yet: said, rather than a link to nowhere. */}
					<span className={styles.panelItem} aria-disabled="true">
						Create an organization
						<span className={styles.soonTag}>Coming soon</span>
					</span>
				</div>
			</div>
		</div>
	);
}
