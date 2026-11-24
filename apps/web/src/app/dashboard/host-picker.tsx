"use client";

import { ChevronDownIcon } from "@/components/icons";
import { useId } from "react";
import { useDisclosure } from "@/components/use-disclosure";
import styles from "./create-event.module.css";
import type { Workspace } from "./types";

/** Up to two initials: first and last words. */
function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const first = Array.from(words[0] ?? "?")[0] ?? "?";
	const last =
		words.length > 1 ? (Array.from(words.at(-1) ?? "")[0] ?? "") : "";
	return `${first}${last}`.toUpperCase();
}

/**
 * Who hosts the new event: the person themselves, or one of their
 * organizations. A disclosure holding native radio buttons, so the form
 * submits the choice as `host` with no hidden copy to keep in step, and arrow
 * keys move between hosts the way they do in any radio group.
 *
 * "New organization" sits under the list as a link, not as a choice: it goes
 * somewhere else rather than picking something here.
 *
 * Escape inside the panel closes the panel only. Its default is prevented, so
 * the dialog around it stays open.
 */
export function HostPicker({
	labelledBy,
	workspaces,
	value,
	onChange,
}: {
	labelledBy: string;
	workspaces: readonly Workspace[];
	value: string;
	onChange: (id: string) => void;
}) {
	const panelId = useId();
	const { open, setOpen, wrapRef, buttonRef } = useDisclosure();
	const chosen =
		workspaces.find((space) => space.id === value) ?? workspaces[0];

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: not an interaction; it only stops Escape in the panel from also closing the dialog
		<div
			className={styles.picker}
			ref={wrapRef}
			onKeyDown={(event) => {
				if (event.key === "Escape" && open) event.preventDefault();
			}}
		>
			<button
				type="button"
				ref={buttonRef}
				className={styles.pickerButton}
				aria-expanded={open}
				aria-controls={panelId}
				aria-labelledby={`${labelledBy} ${panelId}-value`}
				onClick={() => setOpen((current) => !current)}
			>
				{chosen ? (
					<HostRow id={`${panelId}-value`} host={chosen} />
				) : (
					<span id={`${panelId}-value`}>Choose a host</span>
				)}
				<ChevronDownIcon className={styles.chevron} />
			</button>

			<div className={styles.pickerPanel} id={panelId} hidden={!open}>
				<div role="radiogroup" aria-labelledby={labelledBy}>
					{workspaces.map((space) => (
						<label key={space.id} className={styles.option}>
							<input
								className={styles.radio}
								type="radio"
								name="host"
								value={space.id}
								checked={space.id === value}
								onChange={() => onChange(space.id)}
								// A pointer choice closes the panel. Arrow keys also fire
								// click, with detail 0, and must only move the choice.
								onClick={(event) => {
									if (event.detail === 0) return;
									setOpen(false);
									buttonRef.current?.focus();
								}}
								// Enter confirms the choice; in a radio it would otherwise
								// submit the whole form.
								onKeyDown={(event) => {
									if (event.key !== "Enter") return;
									event.preventDefault();
									setOpen(false);
									buttonRef.current?.focus();
								}}
							/>
							<HostRow host={space} />
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
						</label>
					))}
				</div>

				{/* Not built yet: said, rather than a link that leaves this form. */}
				<span className={styles.newOrg} aria-disabled="true">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					New organization
					<span className={styles.soonTag}>Coming soon</span>
				</span>
			</div>
		</div>
	);
}

/** Initials, name, and whose it is: "GA  Ganesh Adimalupu  Personal". */
function HostRow({ host, id }: { host: Workspace; id?: string }) {
	return (
		<span className={styles.host} id={id}>
			<span
				className={`${styles.mark} ${host.personal ? styles.markPersonal : ""}`}
				aria-hidden="true"
			>
				{initials(host.name)}
			</span>
			<span className={styles.hostName}>{host.name}</span>
			<span className={styles.hostKind}>
				{host.personal ? "Personal" : "Organization"}
			</span>
		</span>
	);
}
