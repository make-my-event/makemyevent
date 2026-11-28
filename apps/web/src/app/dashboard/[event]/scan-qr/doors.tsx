"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { CloseIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import {
	addDoor,
	assignDoor,
	type DoorResult,
	removeDoor,
	renameDoor,
	setDoors,
} from "./doors-actions";
import styles from "./scanner.module.css";

export type Door = { id: string; name: string };
export type DoorState = {
	enabled: boolean;
	list: Door[];
	/** This person's door, if they're a volunteer held to one. */
	assigned: Door | null;
};
export type DoorSetup = {
	volunteers: { memberId: string; name: string; doorId: string | null }[];
};

const NAME_MAX = 40;

/**
 * Which door this phone is at. Opened when the camera starts (a quick
 * "Scanning at Main gate?"), and from the door chip. A volunteer held to a
 * door sees it and can't change it here.
 */
export function DoorPicker({
	open,
	doors,
	current,
	purpose,
	onClose,
	onPick,
}: {
	open: boolean;
	doors: DoorState;
	current: string | null;
	/** start: confirm before the camera starts. change: just pick. */
	purpose: "start" | "change";
	onClose: () => void;
	onPick: (doorId: string) => void;
}) {
	const ref = useModalDialog(open);
	const id = useId();
	const [choice, setChoice] = useState<string | null>(current);
	useEffect(() => {
		if (open) setChoice(doors.assigned?.id ?? current);
	}, [open, current, doors.assigned]);
	const picked = doors.list.find((d) => d.id === choice) ?? null;
	const title = doors.assigned
		? `Scanning at ${doors.assigned.name}`
		: purpose === "start" && picked
			? `Scanning at ${picked.name}?`
			: "Which door are you at?";

	return (
		<dialog
			ref={ref}
			className={styles.dialog}
			aria-labelledby={`${id}t`}
			onClose={ownClose(onClose)}
		>
			<form
				className={styles.dialogBody}
				onSubmit={(e) => {
					e.preventDefault();
					const door = doors.assigned?.id ?? choice;
					if (!door) return;
					onPick(door);
					ref.current?.close();
				}}
			>
				<h3 className={styles.dialogTitle} id={`${id}t`}>
					{title}
				</h3>
				{doors.assigned ? (
					<p className={styles.hint}>
						An organizer assigned you to this door. Ask them to move you if
						you're somewhere else.
					</p>
				) : (
					<fieldset className={styles.doorChoices}>
						<legend className={styles.hint}>
							Each guest you let in is recorded at this door.
						</legend>
						{doors.list.map((d) => (
							<label key={d.id} className={styles.doorChoice}>
								<input
									type="radio"
									name={`${id}d`}
									checked={choice === d.id}
									onChange={() => setChoice(d.id)}
								/>
								{d.name}
							</label>
						))}
					</fieldset>
				)}
				<div className={styles.dialogActions}>
					<button
						type="button"
						className={styles.secondaryButton}
						onClick={() => ref.current?.close()}
					>
						Cancel
					</button>
					<button
						type="submit"
						className={styles.primaryButton}
						disabled={!doors.assigned && !choice}
					>
						{purpose === "start" ? "Start scanning" : "Use this door"}
					</button>
				</div>
			</form>
		</dialog>
	);
}

/**
 * Doors, for those who manage the event: the switch, the doors, and which
 * volunteer is held to which. Every change saves at once.
 */
export function DoorsPanel({
	open,
	eventId,
	doors,
	setup,
	onClose,
}: {
	open: boolean;
	eventId: string;
	doors: DoorState;
	setup: DoorSetup;
	onClose: () => void;
}) {
	const ref = useModalDialog(open);
	const id = useId();
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [message, setMessage] = useState<string | null>(null);
	const [adding, setAdding] = useState("");

	function act(work: () => Promise<DoorResult>, after?: () => void) {
		setMessage(null);
		startTransition(async () => {
			const result = await work();
			if (!result.ok) setMessage(result.message);
			else {
				after?.();
				router.refresh();
			}
		});
	}

	return (
		<dialog
			ref={ref}
			className={`${styles.dialog} ${styles.doorsDialog}`}
			aria-labelledby={`${id}t`}
			onClose={ownClose(onClose)}
		>
			<div className={styles.dialogBody}>
				<div className={styles.doorsHead}>
					<h3 className={styles.dialogTitle} id={`${id}t`}>
						Doors
					</h3>
					<button
						type="button"
						className={styles.bannerClose}
						onClick={() => ref.current?.close()}
						aria-label="Close"
					>
						<CloseIcon />
					</button>
				</div>

				<label className={styles.toggle}>
					<input
						type="checkbox"
						role="switch"
						aria-checked={doors.enabled}
						className={styles.toggleInput}
						checked={doors.enabled}
						disabled={pending}
						onChange={(e) => act(() => setDoors(eventId, e.target.checked))}
					/>
					<span className={styles.toggleLabel}>More than one door</span>
				</label>
				<p className={styles.hint}>
					{doors.enabled
						? "Staff pick their door when they start scanning, and each guest is recorded at it."
						: "Off: one way in, and no door is asked for. Add two or more doors, then turn this on."}
				</p>

				<p className={styles.message} role="status">
					{message}
				</p>

				<ul className={styles.doorList} aria-label="Doors">
					{doors.list.map((d) => (
						<li key={d.id} className={styles.doorRow}>
							<label className={styles.srOnly} htmlFor={`${id}${d.id}`}>
								Door name
							</label>
							<input
								id={`${id}${d.id}`}
								className={styles.doorName}
								defaultValue={d.name}
								maxLength={NAME_MAX}
								autoComplete="off"
								disabled={pending}
								onBlur={(e) => {
									const next = e.target.value.trim();
									if (next && next !== d.name)
										act(() => renameDoor(eventId, d.id, next));
									else e.target.value = d.name;
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") e.currentTarget.blur();
								}}
							/>
							<button
								type="button"
								className={styles.iconButton}
								aria-label={`Remove ${d.name}`}
								disabled={pending}
								onClick={() => act(() => removeDoor(eventId, d.id))}
							>
								<TrashIcon />
							</button>
						</li>
					))}
				</ul>

				<form
					className={styles.addDoor}
					onSubmit={(e) => {
						e.preventDefault();
						const name = adding.trim();
						if (name)
							act(
								() => addDoor(eventId, name),
								() => setAdding(""),
							);
					}}
				>
					<label className={styles.srOnly} htmlFor={`${id}add`}>
						New door
					</label>
					<input
						id={`${id}add`}
						className={styles.doorName}
						value={adding}
						onChange={(e) => setAdding(e.target.value)}
						placeholder="Main gate"
						maxLength={NAME_MAX}
						autoComplete="off"
					/>
					<button
						type="submit"
						className={styles.secondaryButton}
						disabled={pending || !adding.trim()}
					>
						<PlusIcon /> Add door
					</button>
				</form>

				{doors.enabled ? (
					<section className={styles.assign} aria-labelledby={`${id}a`}>
						<h4 className={styles.assignTitle} id={`${id}a`}>
							Volunteers
						</h4>
						<p className={styles.hint}>
							Hold a volunteer to one door, or let them pick. Organizers and
							admins always pick, since they move around.
						</p>
						{setup.volunteers.length === 0 ? (
							<p className={styles.hint}>No volunteers on the team yet.</p>
						) : (
							<ul className={styles.doorList}>
								{setup.volunteers.map((v) => (
									<li key={v.memberId} className={styles.doorRow}>
										<label
											className={styles.assignName}
											htmlFor={`${id}v${v.memberId}`}
										>
											{v.name}
										</label>
										<select
											id={`${id}v${v.memberId}`}
											className={styles.assignSelect}
											value={v.doorId ?? ""}
											disabled={pending}
											onChange={(e) =>
												act(() =>
													assignDoor(
														eventId,
														v.memberId,
														e.target.value || null,
													),
												)
											}
										>
											<option value="">Any door</option>
											{doors.list.map((d) => (
												<option key={d.id} value={d.id}>
													{d.name}
												</option>
											))}
										</select>
									</li>
								))}
							</ul>
						)}
					</section>
				) : null}
			</div>
		</dialog>
	);
}
