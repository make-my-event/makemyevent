"use client";

import { ADDRESS_MAX, POSTER_ALT_MAX } from "@makemyevent/core";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { CopyIcon, EditIcon, SettingsIcon, TickIcon } from "@/components/icons";
import { useCopy } from "@/components/ui/use-copy";
import { SaveBar } from "@/components/ui/save-bar";
import { useDraft } from "@/components/ui/use-draft";
import { useUnsavedChanges } from "../unsaved-changes";
import {
	type AddressCheck,
	checkAddress,
	type EventPageField,
	saveEventPage,
} from "./actions";
import { type Media, PosterPanel } from "./poster-panel";
import { AboutEditorSkeleton } from "./about-editor-skeleton";
import { ScheduleCard, type ScheduleValues } from "./schedule-card";
import pairStyles from "./schedule-venue.module.css";
import { type LinkRow, SocialLinksCard } from "./social-links-card";
import { VenueCard, type VenueValues } from "./venue-card";

/**
 * The editor is this tab's heaviest part, so its code loads on its own,
 * with a skeleton of the same size meanwhile.
 */
const AboutEditor = dynamic(() => import("./about-editor"), {
	ssr: false,
	loading: () => <AboutEditorSkeleton />,
});
import styles from "./event-page.module.css";

type Values = {
	address: string;
	posterAlt: string;
	/** The About document as JSON text; "" when empty. */
	about: string;
	inviteOnly: boolean;
	listed: boolean;
	registrationClosed: boolean;
	capacity: string;
	links: LinkRow[];
} & ScheduleValues &
	VenueValues;

const SCHEDULE_FIELDS = [
	"timeZone",
	"start",
	"end",
	"opensAt",
	"closesAt",
] as const;
const VENUE_FIELDS = [
	"format",
	"venueAddress",
	"venueName",
	"onlineUrl",
	"pin",
] as const;
type ScheduleField = (typeof SCHEDULE_FIELDS)[number];
type VenueField = (typeof VENUE_FIELDS)[number];

const same = (a: Values, b: Values) =>
	a.timeZone === b.timeZone &&
	a.startDate === b.startDate &&
	a.startTime === b.startTime &&
	a.endDate === b.endDate &&
	a.endTime === b.endTime &&
	a.opensAt === b.opensAt &&
	a.closesAt === b.closesAt &&
	a.format === b.format &&
	a.venueAddress.trim() === b.venueAddress.trim() &&
	a.venueName.trim() === b.venueName.trim() &&
	a.lat === b.lat &&
	a.lng === b.lng &&
	a.onlineUrl.trim() === b.onlineUrl.trim() &&
	a.address === b.address &&
	a.posterAlt.trim() === b.posterAlt.trim() &&
	a.about === b.about &&
	a.inviteOnly === b.inviteOnly &&
	a.listed === b.listed &&
	a.registrationClosed === b.registrationClosed &&
	a.capacity.trim() === b.capacity.trim() &&
	a.links.length === b.links.length &&
	a.links.every(
		(link, i) =>
			link.kind === b.links[i]?.kind &&
			link.value.trim() === b.links[i]?.value.trim(),
	);

/**
 * The Event Page tab: the poster and logo with the public address under
 * them, and how guests get in.
 *
 *   ┌───────────────┐   Registration behaviour  How guests get in
 *   │               │   ┌───────────────────────────────────────┐
 *   │    poster     │   │ Invite only                       ( ) │
 *   │     4:5       │   │ Public listing                    (●) │
 *   │ (logo)        │   │ Capacity                       [ 250] │
 *   └───────────────┘   │ Close registration                ( ) │
 *   [host/event/slug ✎] └───────────────────────────────────────┘
 *
 * Edits are held here until Save changes; leaving with edits asks first
 * (UnsavedChangesGuard). Everything saves in one transaction.
 */
export function EventPageForm({
	eventId,
	origin,
	publicBase,
	published,
	media,
	saved: savedProp,
	someInviteOnly,
	ticketCount,
}: {
	eventId: string;
	origin: string;
	/** The public page's address up to the event's own part, from the server. */
	publicBase: string;
	published: boolean;
	media: Media;
	saved: Values;
	someInviteOnly: boolean;
	ticketCount: number;
}) {
	const router = useRouter();
	const { saved, setSaved, draft, setDraft, dirty } = useDraft(savedProp, same);
	const [error, setError] = useState<{
		field: EventPageField | null;
		message: string;
		linkIndex?: number;
	} | null>(null);
	const [pending, startTransition] = useTransition();
	const [justSaved, setJustSaved] = useState(false);

	const set = <K extends keyof Values>(key: K, value: Values[K]) =>
		setMany({ [key]: value } as Partial<Values>);
	const setMany = (next: Partial<Values>) => {
		setDraft((current) => ({ ...current, ...next }));
		setError(null);
		setJustSaved(false);
	};
	const scheduleError =
		error && (SCHEDULE_FIELDS as readonly unknown[]).includes(error.field)
			? { field: error.field as ScheduleField, message: error.message }
			: null;
	const venueError =
		error && (VENUE_FIELDS as readonly unknown[]).includes(error.field)
			? { field: error.field as VenueField, message: error.message }
			: null;

	async function save(): Promise<boolean> {
		const result = await saveEventPage(eventId, {
			...draft,
			about: draft.about === "" ? null : (JSON.parse(draft.about) as unknown),
			links: draft.links.map(({ kind, value }) => ({ kind, value })),
		});
		if (!result.ok) {
			setError({
				field: result.field,
				message: result.message,
				...(result.linkIndex === undefined
					? {}
					: { linkIndex: result.linkIndex }),
			});
			return false;
		}
		const next = {
			...draft,
			address: result.address,
			capacity: draft.capacity.trim(),
		};
		setSaved(next);
		setDraft(next);
		setError(null);
		setJustSaved(true);
		// The dashboard's own address follows the event's.
		if (result.address !== saved.address)
			router.replace(`/dashboard/${encodeURIComponent(result.address)}/edit`);
		else router.refresh();
		return true;
	}

	useUnsavedChanges(dirty, save);

	return (
		<div className={styles.layout}>
			<div className={styles.media}>
				<PosterPanel eventId={eventId} media={media} alt={saved.posterAlt} />

				<AddressField
					eventId={eventId}
					origin={origin}
					publicBase={publicBase}
					published={published}
					savedAddress={saved.address}
					value={draft.address}
					onChange={(value) => set("address", value)}
					error={error?.field === "address" ? error.message : null}
				/>
				{media.poster ? (
					<PosterAltField
						value={draft.posterAlt}
						onChange={(value) => set("posterAlt", value)}
						error={error?.field === "posterAlt" ? error.message : null}
					/>
				) : null}
			</div>

			<section className={styles.behaviour} aria-labelledby="behaviour-title">
				<header className={styles.behaviourHead}>
					<h3 className={styles.behaviourTitle} id="behaviour-title">
						Registration behaviour
					</h3>
					<p className={styles.behaviourLead}>How guests get in</p>
				</header>

				<div className={styles.card}>
					<SwitchRow
						label="Invite only"
						description={
							someInviteOnly && !draft.inviteOnly
								? "Some tickets already need an invite. Turn on to require one for every ticket."
								: "Every ticket needs an invite to register"
						}
						checked={draft.inviteOnly}
						onChange={(value) => set("inviteOnly", value)}
						disabled={ticketCount === 0}
					/>
					<SwitchRow
						label="Public listing"
						description={`Show on ${origin}/explore once it is published`}
						checked={draft.listed}
						onChange={(value) => set("listed", value)}
					/>
					<CapacityRow
						value={draft.capacity}
						onChange={(value) => set("capacity", value)}
						error={error?.field === "capacity" ? error.message : null}
					/>
					<SwitchRow
						label="Close registration"
						description={
							draft.registrationClosed
								? "Closed: no one can register until you turn this off"
								: "Stop accepting registrations now"
						}
						checked={draft.registrationClosed}
						onChange={(value) => set("registrationClosed", value)}
					/>
					{/* Kept on purpose, so the card has its final shape; what goes
					    inside comes later, so it says so instead of opening nothing. */}
					<button
						type="button"
						className={styles.advanced}
						aria-disabled="true"
						title="Coming soon"
					>
						<SettingsIcon />
						Advanced settings
						<span className={styles.soon}>Coming soon</span>
					</button>
				</div>
			</section>

			<AboutEditor
				eventId={eventId}
				value={draft.about}
				onChange={(value) => set("about", value)}
				error={error?.field === "about" ? error.message : null}
			/>

			<div className={pairStyles.pairRow}>
				<ScheduleCard value={draft} onChange={setMany} error={scheduleError} />
				<VenueCard value={draft} onChange={setMany} error={venueError} />
			</div>

			<SocialLinksCard
				value={draft.links}
				onChange={(links) => setMany({ links })}
				error={
					error?.field === "links"
						? { index: error.linkIndex ?? null, message: error.message }
						: null
				}
			/>

			{dirty || justSaved || (error && error.field === null) ? (
				<SaveBar
					className={styles.saveBarPlace}
					message={
						error && error.field === null
							? { tone: "error", text: error.message }
							: dirty
								? { tone: "plain", text: "You have unsaved changes" }
								: { tone: "saved" }
					}
					dirty={dirty}
					pending={pending}
					onDiscard={() => {
						setDraft(saved);
						setError(null);
					}}
					onSave={() => startTransition(async () => void (await save()))}
				/>
			) : null}
		</div>
	);
}

/** One setting: its name and what it does, and a switch. */
function SwitchRow({
	label,
	description,
	checked,
	onChange,
	disabled = false,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	const labelId = useId();
	const descriptionId = useId();
	return (
		<div className={styles.row}>
			<div className={styles.rowText}>
				<p className={styles.rowLabel} id={labelId}>
					{label}
				</p>
				<p className={styles.rowDescription} id={descriptionId}>
					{description}
				</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-labelledby={labelId}
				aria-describedby={descriptionId}
				className={styles.switch}
				disabled={disabled}
				onClick={() => onChange(!checked)}
			>
				<span className={styles.switchThumb} />
			</button>
		</div>
	);
}

function CapacityRow({
	value,
	onChange,
	error,
}: {
	value: string;
	onChange: (value: string) => void;
	error: string | null;
}) {
	const hintId = useId();
	const errorId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	// Linked to from the Glance ("set one", "Change limit"): arriving that way
	// puts the cursor in the field.
	useEffect(() => {
		if (window.location.hash === "#capacity") inputRef.current?.focus();
	}, []);
	return (
		<div className={styles.row}>
			<div className={styles.rowText}>
				<label className={styles.rowLabel} htmlFor="capacity">
					Capacity
				</label>
				<p className={styles.rowDescription} id={hintId}>
					{error ? (
						<span className={styles.fieldError} id={errorId}>
							{error}
						</span>
					) : (
						"Places in all. Leave empty for no limit."
					)}
				</p>
			</div>
			<input
				ref={inputRef}
				id="capacity"
				className={styles.capacity}
				inputMode="numeric"
				pattern="[0-9]*"
				autoComplete="off"
				placeholder="No limit"
				value={value}
				onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
				aria-invalid={error ? true : undefined}
				aria-describedby={hintId}
			/>
		</div>
	);
}

/**
 * The public address, under the poster. A pencil opens it for editing; the
 * database says whether a new one is free as it is typed. Once the event is
 * public, the old address keeps working after a change.
 */
function AddressField({
	eventId,
	origin,
	publicBase,
	published,
	savedAddress,
	value,
	onChange,
	error,
}: {
	eventId: string;
	origin: string;
	publicBase: string;
	published: boolean;
	savedAddress: string;
	value: string;
	onChange: (value: string) => void;
	error: string | null;
}) {
	const [editing, setEditing] = useState(false);
	const [check, setCheck] = useState<AddressCheck | "checking" | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const statusId = useId();
	const { copied, copy } = useCopy();
	const changed = value !== savedAddress;

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	// Asks the database a moment after typing stops, not on every key.
	useEffect(() => {
		if (!changed || value === "") {
			setCheck(null);
			return;
		}
		setCheck("checking");
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			const result = await checkAddress(eventId, value);
			if (!cancelled) setCheck(result);
		}, 400);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [changed, value, eventId]);

	const message = error
		? { tone: "error", text: error }
		: check === "taken"
			? { tone: "error", text: "Taken. Try another, like adding the year." }
			: check === "invalid"
				? {
						tone: "error",
						text: "Use lowercase letters, numbers and single hyphens.",
					}
				: check === "available"
					? {
							tone: "ok",
							text: published
								? `Available. ${savedAddress} will keep working too.`
								: "Available",
						}
					: check === "checking"
						? { tone: "muted", text: "Checking…" }
						: check === "slow"
							? {
									tone: "muted",
									text: "Checking too fast. Wait a moment; it is checked again when you save.",
								}
							: null;

	return (
		<div className={styles.address}>
			<div className={styles.addressField}>
				<span className={styles.addressPrefix}>{origin}/event/</span>
				{editing ? (
					<input
						ref={inputRef}
						className={styles.addressInput}
						aria-label="Public address"
						value={value}
						maxLength={ADDRESS_MAX}
						spellCheck={false}
						autoComplete="off"
						autoCapitalize="none"
						onChange={(event) =>
							onChange(
								event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
							)
						}
						// Tidied on leaving: no hyphen at either end, none doubled.
						onBlur={(event) =>
							onChange(
								event.target.value
									.replace(/-{2,}/g, "-")
									.replace(/^-+|-+$/g, ""),
							)
						}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								onChange(savedAddress);
								setEditing(false);
							}
						}}
						aria-describedby={message ? statusId : undefined}
						aria-invalid={message?.tone === "error" ? true : undefined}
					/>
				) : (
					<span className={styles.addressValue} title={value}>
						{value}
					</span>
				)}
				{editing ? null : (
					<button
						type="button"
						className={styles.addressEdit}
						onClick={() => setEditing(true)}
						title="Change address"
					>
						<span className={styles.srOnly}>Change address</span>
						<EditIcon />
					</button>
				)}
				{editing ? null : (
					<button
						type="button"
						className={styles.addressEdit}
						onClick={() => void copy(`${publicBase}${savedAddress}`)}
						title={copied ? "Copied" : "Copy link"}
					>
						<span className={styles.srOnly}>Copy link</span>
						{copied ? <TickIcon className={styles.copiedIcon} /> : <CopyIcon />}
					</button>
				)}
				<span className={styles.srOnly} aria-live="polite">
					{copied ? "Link copied" : ""}
				</span>
			</div>
			{message ? (
				<p
					className={`${styles.addressStatus} ${
						message.tone === "error"
							? styles.statusError
							: message.tone === "ok"
								? styles.statusOk
								: ""
					}`}
					id={statusId}
					aria-live="polite"
				>
					{message.text}
				</p>
			) : null}
		</div>
	);
}

/**
 * The poster in words, for people who cannot see it: the public page uses it
 * as the image's alt text. Saved with the rest of the tab.
 */
function PosterAltField({
	value,
	onChange,
	error,
}: {
	value: string;
	onChange: (value: string) => void;
	error: string | null;
}) {
	const id = useId();
	const hintId = useId();
	return (
		<div className={styles.altField}>
			<label className={styles.altLabel} htmlFor={id}>
				Describe the poster
			</label>
			<textarea
				id={id}
				className={styles.altInput}
				rows={2}
				maxLength={POSTER_ALT_MAX}
				value={value}
				placeholder="For example: Design Summit 2026, 12 Dec, Bengaluru, with speaker photos"
				onChange={(event) => onChange(event.target.value)}
				aria-describedby={hintId}
				aria-invalid={error ? true : undefined}
			/>
			<p className={styles.altHint} id={hintId}>
				{error ? (
					<span className={styles.fieldError}>{error}</span>
				) : (
					"Read aloud to people using a screen reader on your event page."
				)}
			</p>
		</div>
	);
}
