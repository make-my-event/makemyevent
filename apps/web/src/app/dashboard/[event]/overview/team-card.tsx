"use client";

import {
	type EventRole,
	MEMBER_ROLES,
	type MemberRole,
	ROLE_LABELS,
} from "@makemyevent/core";
import {
	useActionState,
	useDeferredValue,
	useEffect,
	useId,
	useState,
	useTransition,
} from "react";
import { PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import dialog from "../../create-event.module.css";
import { Popup } from "../../popup";
import {
	addMember,
	removeMember,
	setMemberRole,
	type TeamFormState,
} from "./team-actions";
import styles from "./team-card.module.css";

export type TeamMember = {
	/** Null for the owner, who is the event's host rather than a team row. */
	id: string | null;
	/** The name on their account; their email while they haven't joined. */
	name: string;
	email: string;
	role: EventRole;
	/** Signed in and on the team; false while it is still an invitation. */
	joined: boolean;
	you: boolean;
};

const ROLE_HINTS: Record<MemberRole, string> = {
	admin: "Everything, the team included, except deleting the event.",
	organizer: "The event page, tickets and guests. Not the team.",
	volunteer: "The guest list and check-in only.",
};

/**
 * The Overview's Team card: who runs the event with its owner, and in what
 * role. The owner and admins add, change and remove members; everyone else
 * on the team sees the list.
 *
 *   Team [3]                           [Search team…] [Add member +]
 *   (N) Namo      namo@gmail.com          Owner
 *   (A) Aishwarya aishwarya@gmail.com     [Organizer ⌄] [✎] [🗑]
 *   (A) amal.dev@gmail.com            Invited [Volunteer ⌄] [🗑]
 *
 * Added by email alone: the name is the one on their account, shown once
 * they join, so no one is known by two names.
 */
export function TeamCard({
	eventId,
	slug,
	members,
	canManage,
}: {
	eventId: string;
	slug: string;
	members: TeamMember[];
	canManage: boolean;
}) {
	const [query, setQuery] = useState("");
	// Said after adding someone, when their invitation email didn't go.
	const [notice, setNotice] = useState<string | null>(null);
	const deferred = useDeferredValue(query.trim().toLowerCase());
	const shown = deferred
		? members.filter(
				(member) =>
					member.name.toLowerCase().includes(deferred) ||
					member.email.includes(deferred),
			)
		: members;
	const searchId = useId();

	return (
		<section className={styles.card} aria-labelledby="team-title">
			<header className={styles.header}>
				<div className={styles.heading}>
					<h3 className={styles.title} id="team-title">
						Team
					</h3>
					<span className={styles.count}>
						<span className={styles.srOnly}>, </span>
						{members.length}
					</span>
				</div>
				<div className={styles.tools}>
					<label className={styles.search} htmlFor={searchId}>
						<span className={styles.srOnly}>Search team</span>
						<input
							id={searchId}
							className={styles.searchInput}
							type="search"
							placeholder="Search team…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							autoComplete="off"
						/>
						<SearchIcon className={styles.searchIcon} />
					</label>
					{canManage ? (
						<AddMemberButton
							eventId={eventId}
							slug={slug}
							onAdded={setNotice}
						/>
					) : null}
				</div>
			</header>

			<p className={styles.notice} role="status">
				{notice}
			</p>

			{shown.length === 0 ? (
				<p className={styles.none}>
					No one on the team matches “{query.trim()}”.
				</p>
			) : (
				<ul className={styles.list}>
					{shown.map((member) => (
						<MemberRow
							key={member.id ?? "owner"}
							member={member}
							slug={slug}
							canManage={canManage}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

function MemberRow({
	member,
	slug,
	canManage,
}: {
	member: TeamMember;
	slug: string;
	canManage: boolean;
}) {
	const editable = canManage && member.id !== null;

	return (
		<li className={styles.row}>
			<span className={styles.avatar} aria-hidden="true">
				{initialOf(member.name)}
			</span>
			<div className={styles.who}>
				<span className={styles.name}>
					<span className={styles.nameText} title={member.name}>
						{member.name}
					</span>
					{/* Kept whole however long the name: it says which row is yours. */}
					{member.you ? <span className={styles.you}>&nbsp;(you)</span> : null}
				</span>
				{member.joined ? (
					<span className={styles.email} title={member.email}>
						{member.email}
					</span>
				) : null}
				{member.joined ? null : (
					<span
						className={styles.invited}
						title="Joins when they sign in with this email"
					>
						Invited
					</span>
				)}
			</div>
			<div className={styles.actions}>
				{editable && member.id ? (
					<>
						<RoleMenu
							memberId={member.id}
							slug={slug}
							name={member.name}
							role={member.role as MemberRole}
						/>
						<RemoveMemberButton
							memberId={member.id}
							slug={slug}
							name={member.name}
						/>
					</>
				) : (
					<span className={styles.roleText}>{ROLE_LABELS[member.role]}</span>
				)}
			</div>
		</li>
	);
}

/** The row's role menu: a change is saved at once. */
function RoleMenu({
	memberId,
	slug,
	name,
	role,
}: {
	memberId: string;
	slug: string;
	name: string;
	role: MemberRole;
}) {
	const [value, setValue] = useState(role);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	// A refresh from the server (after the pencil, say) wins.
	useEffect(() => setValue(role), [role]);

	return (
		<>
			<select
				className={styles.select}
				aria-label={`Role of ${name}`}
				value={value}
				disabled={pending}
				aria-busy={pending || undefined}
				onChange={(event) => {
					const next = event.target.value as MemberRole;
					const before = value;
					setValue(next);
					setError(null);
					startTransition(async () => {
						const result = await setMemberRole(memberId, slug, next);
						if (!result.ok) {
							setValue(before);
							setError(result.message);
						}
					});
				}}
			>
				{MEMBER_ROLES.map((option) => (
					<option key={option} value={option}>
						{ROLE_LABELS[option]}
					</option>
				))}
			</select>
			{error ? (
				<span className={styles.srOnly} role="alert">
					{error}
				</span>
			) : null}
		</>
	);
}

function AddMemberButton({
	eventId,
	slug,
	onAdded,
}: {
	eventId: string;
	slug: string;
	onAdded: (notice: string | null) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				className={styles.add}
				aria-haspopup="dialog"
				onClick={() => setOpen(true)}
			>
				Add member
				<PlusIcon />
			</button>
			<Popup
				open={open}
				onClose={() => setOpen(false)}
				title="Add a team member"
			>
				<MemberForm
					action={addMember.bind(null, eventId, slug)}
					submitLabel="Add member"
					pendingLabel="Adding…"
					onDone={(notice) => {
						setOpen(false);
						onAdded(notice);
					}}
					onCancel={() => setOpen(false)}
				/>
			</Popup>
		</>
	);
}

/**
 * Email and role, for Add member. Posts to a server action, which validates
 * again and runs under the database's rules.
 */
function MemberForm({
	action,
	submitLabel,
	pendingLabel,
	onDone,
	onCancel,
}: {
	action: (state: TeamFormState, form: FormData) => Promise<TeamFormState>;
	submitLabel: string;
	pendingLabel: string;
	onDone: (notice: string | null) => void;
	onCancel: () => void;
}) {
	const [submitted, setSubmitted] = useState(false);
	const [state, formAction, pending] = useActionState(
		async (previous: TeamFormState, form: FormData) => {
			const result = await action(previous, form);
			if (result === null || result.added) {
				onDone(result?.message ?? null);
				return null;
			}
			return result;
		},
		null,
	);
	const [role, setRole] = useState<MemberRole>("volunteer");
	const emailId = useId();
	const roleId = useId();
	const errorId = useId();
	const hintId = useId();
	const invalid = (field: "email" | "role") =>
		state?.field === field || undefined;

	return (
		<form
			className={styles.form}
			action={formAction}
			noValidate
			onSubmit={() => setSubmitted(true)}
		>
			<div className={dialog.field}>
				<label className={dialog.label} htmlFor={emailId}>
					Email
				</label>
				<input
					id={emailId}
					name="email"
					type="email"
					inputMode="email"
					className={dialog.input}
					autoComplete="off"
					spellCheck={false}
					required
					aria-invalid={invalid("email")}
					aria-describedby={invalid("email") ? errorId : undefined}
				/>
				<p className={styles.fieldHint}>
					We email them an invitation. They join when they sign in with this
					address, and their name comes from their account.
				</p>
			</div>

			<div className={dialog.field}>
				<label className={dialog.label} htmlFor={roleId}>
					Role
				</label>
				<select
					id={roleId}
					name="role"
					className={`${dialog.input} ${styles.formSelect}`}
					value={role}
					onChange={(event) => setRole(event.target.value as MemberRole)}
					aria-describedby={hintId}
					aria-invalid={invalid("role")}
				>
					{MEMBER_ROLES.map((option) => (
						<option key={option} value={option}>
							{ROLE_LABELS[option]}
						</option>
					))}
				</select>
				<p className={styles.fieldHint} id={hintId}>
					{ROLE_HINTS[role]}
				</p>
			</div>

			{state && submitted ? (
				<p className={styles.formError} id={errorId} role="alert">
					{state.message}
				</p>
			) : null}

			<div className={dialog.actions}>
				<button
					type="button"
					className={dialog.secondary}
					onClick={onCancel}
					disabled={pending}
				>
					Cancel
				</button>
				<button
					type="submit"
					className={dialog.primary}
					disabled={pending}
					aria-busy={pending || undefined}
				>
					{pending ? pendingLabel : submitLabel}
				</button>
			</div>
		</form>
	);
}

/** The bin: asks first, since removing someone takes their access away at once. */
function RemoveMemberButton({
	memberId,
	slug,
	name,
}: {
	memberId: string;
	slug: string;
	name: string;
}) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	return (
		<>
			<button
				type="button"
				className={`${styles.iconButton} ${styles.danger}`}
				aria-haspopup="dialog"
				title="Remove"
				onClick={() => {
					setError(null);
					setOpen(true);
				}}
			>
				<span className={styles.srOnly}>Remove {name}</span>
				<TrashIcon />
			</button>
			<Popup
				open={open}
				onClose={() => setOpen(false)}
				title="Remove from team?"
			>
				<p className={dialog.lead}>
					{name} loses access to this event's dashboard straight away. You can
					add them again later.
				</p>
				{error ? (
					<p className={styles.formError} role="alert">
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
								const result = await removeMember(memberId, slug);
								if (result.ok) setOpen(false);
								else setError(result.message);
							})
						}
					>
						{pending ? "Removing…" : "Remove"}
					</button>
				</div>
			</Popup>
		</>
	);
}

/** The first letter of the name, for the avatar: "amal" → "A". */
function initialOf(name: string): string {
	const first = name.trim().match(/[\p{L}\p{N}]/u)?.[0];
	return first ? first.toLocaleUpperCase() : "?";
}

/** The card while it loads: header, and rows for the owner and two more. */
export function TeamCardSkeleton() {
	return (
		<div className={styles.card} aria-hidden="true">
			<div className={styles.header}>
				<span className={`${styles.bone} ${styles.boneTitle}`} />
				<span className={`${styles.bone} ${styles.boneTool}`} />
			</div>
			<div className={styles.list}>
				{[0, 1, 2].map((n) => (
					<div key={n} className={styles.row}>
						<span className={`${styles.bone} ${styles.boneAvatar}`} />
						<span className={`${styles.bone} ${styles.boneLine}`} />
					</div>
				))}
			</div>
		</div>
	);
}
