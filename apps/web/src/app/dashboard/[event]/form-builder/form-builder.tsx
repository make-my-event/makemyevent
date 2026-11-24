"use client";

import {
	dependentsOf,
	duplicateField,
	FIELD_KIND_INFO,
	FORM_LIMITS,
	type FormField,
	type FormProblem,
	formProblems,
	moveProblem,
	removeField,
} from "@makemyevent/core";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
} from "react";
import {
	ChevronDownIcon,
	DuplicateIcon,
	PlusIcon,
	TrashIcon,
} from "@/components/icons";
import { SaveBar } from "@/components/ui/save-bar";
import { useDraft } from "@/components/ui/use-draft";
import { fold } from "@/lib/text";
import { Popup } from "../../popup";
import { useUnsavedChanges } from "../unsaved-changes";
import { saveForm } from "./actions";
import { AddFieldDialog } from "./add-field-dialog";
import { describeShowIf } from "./describe";
import { FieldEditor } from "./field-editor";
import { FormPreview } from "./form-preview";
import {
	AlertIcon,
	BranchIcon,
	GripIcon,
	KindIcon,
	LockIcon,
} from "./kind-icon";
import styles from "./form-builder.module.css";

type Ticket = { id: string; name: string };

const same = (a: readonly FormField[], b: readonly FormField[]) =>
	JSON.stringify(a) === JSON.stringify(b);

function move<T>(list: readonly T[], from: number, to: number): T[] {
	const next = [...list];
	const [item] = next.splice(from, 1);
	if (item !== undefined) next.splice(to, 0, item);
	return next;
}

function subscribeOnline(onChange: () => void) {
	window.addEventListener("online", onChange);
	window.addEventListener("offline", onChange);
	return () => {
		window.removeEventListener("online", onChange);
		window.removeEventListener("offline", onChange);
	};
}

/**
 * The Form Builder: the event's registration form as a list of questions,
 * each opened in place to edit, with a guest preview beside it.
 *
 * Edits are a draft until Save changes, like the Event Page. The draft is
 * checked as it changes (formProblems, the same rules the server applies),
 * so problems show where they are, on the field, and Save goes to the first
 * one instead of failing at the server.
 */
export function FormBuilder({
	eventId,
	version: versionProp,
	saved: savedProp,
	tickets,
	registered,
	answered,
	eventTitle,
}: {
	eventId: string;
	version: string;
	saved: FormField[];
	tickets: Ticket[];
	registered: number;
	/** Fields guests have answered. */
	answered: string[];
	eventTitle: string;
}) {
	const router = useRouter();
	const id = useId();
	const [version, setVersion] = useState(versionProp);
	// New server values (a save, or another tab's) reset the form, and its
	// version with it, when nothing here is being edited.
	const { saved, setSaved, draft, setDraft, dirty } = useDraft(
		savedProp,
		same,
		() => setVersion(versionProp),
	);
	const [openId, setOpenId] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [confirm, setConfirm] = useState<FormField | null>(null);
	const [status, setStatus] = useState<
		| { kind: "error"; message: string; reload?: boolean }
		| { kind: "saved" }
		| null
	>(null);
	const [announcement, setAnnouncement] = useState("");
	const [pending, startTransition] = useTransition();
	const online = useSyncExternalStore(
		subscribeOnline,
		() => navigator.onLine,
		() => true,
	);

	const answeredSet = useMemo(() => new Set(answered), [answered]);
	const context = useMemo(() => ({ tickets }), [tickets]);
	const problems = useMemo(
		() => formProblems(draft, context),
		[draft, context],
	);
	const problemsBy = useMemo(() => {
		const map = new Map<string, FormProblem[]>();
		for (const problem of problems)
			if (problem.fieldId)
				map.set(problem.fieldId, [
					...(map.get(problem.fieldId) ?? []),
					problem,
				]);
		return map;
	}, [problems]);

	// Focus moves to a field's first box when it is added or duplicated.
	const labelRefs = useRef(new Map<string, HTMLInputElement>());
	const handleRefs = useRef(new Map<string, HTMLButtonElement>());
	const rowRefs = useRef(new Map<string, HTMLLIElement>());
	const focusLabel = useRef<string | null>(null);
	useEffect(() => {
		const target = focusLabel.current;
		if (!target) return;
		const input = labelRefs.current.get(target);
		if (!input) return;
		focusLabel.current = null;
		input.focus();
		input.select();
		rowRefs.current.get(target)?.scrollIntoView({ block: "nearest" });
	});

	const update = useCallback(
		(field: FormField) => {
			setDraft((current) =>
				current.map((f) => (f.id === field.id ? field : f)),
			);
			setStatus(null);
		},
		[setDraft],
	);

	function insert(field: FormField, at: number) {
		setDraft((current) => [
			...current.slice(0, at),
			field,
			...current.slice(at),
		]);
		setOpenId(field.id);
		focusLabel.current = field.id;
		setStatus(null);
		setAnnouncement(`Added ${field.label}, question ${at + 1}.`);
	}

	function remove(field: FormField) {
		setDraft((current) => removeField(current, field.id));
		if (openId === field.id) setOpenId(null);
		setStatus(null);
		setAnnouncement(
			`Deleted ${field.label}. Discard changes to bring it back.`,
		);
	}

	function askRemove(field: FormField) {
		if (field.core) return;
		if (dependentsOf(draft, field.id).length > 0) setConfirm(field);
		else remove(field);
	}

	// ---- Reordering ---------------------------------------------------------

	const [lifted, setLifted] = useState<string | null>(null);
	const liftedFrom = useRef<FormField[] | null>(null);
	const draggingRef = useRef<{ id: string; pointer: number } | null>(null);
	const lastRefusal = useRef<string | null>(null);

	const tryMove = useCallback(
		(fieldId: string, to: number): boolean => {
			const from = draft.findIndex((f) => f.id === fieldId);
			if (from < 0 || to < 0 || to >= draft.length || from === to) return false;
			const refused = moveProblem(draft, from, to);
			if (refused) {
				if (lastRefusal.current !== refused) setAnnouncement(refused);
				lastRefusal.current = refused;
				return false;
			}
			lastRefusal.current = null;
			setDraft(move(draft, from, to));
			setStatus(null);
			return true;
		},
		[draft, setDraft],
	);

	// A moved row keeps keyboard focus on its handle.
	useEffect(() => {
		if (lifted) handleRefs.current.get(lifted)?.focus();
	});

	function onHandleKey(
		event: React.KeyboardEvent,
		field: FormField,
		index: number,
	) {
		const label = field.label || "Untitled question";
		if (event.key === " " || event.key === "Enter") {
			event.preventDefault();
			if (lifted === field.id) {
				setLifted(null);
				liftedFrom.current = null;
				setAnnouncement(
					`${label} dropped at place ${index + 1} of ${draft.length}.`,
				);
			} else {
				setLifted(field.id);
				liftedFrom.current = draft;
				setAnnouncement(
					`${label} picked up, place ${index + 1} of ${draft.length}. Up and down arrows move it, Space drops it, Escape puts it back.`,
				);
			}
		} else if (
			lifted === field.id &&
			(event.key === "ArrowUp" || event.key === "ArrowDown")
		) {
			event.preventDefault();
			const to = index + (event.key === "ArrowUp" ? -1 : 1);
			if (tryMove(field.id, to))
				setAnnouncement(`${label}, place ${to + 1} of ${draft.length}.`);
		} else if (lifted === field.id && event.key === "Escape") {
			event.preventDefault();
			if (liftedFrom.current) setDraft(liftedFrom.current);
			liftedFrom.current = null;
			setLifted(null);
			setAnnouncement(`Move cancelled. ${label} is back where it was.`);
		}
	}

	function onPointerDown(
		event: React.PointerEvent<HTMLButtonElement>,
		field: FormField,
	) {
		if (event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		draggingRef.current = { id: field.id, pointer: event.pointerId };
		lastRefusal.current = null;
		setLifted(field.id);
		liftedFrom.current = draft;
	}

	function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
		const drag = draggingRef.current;
		if (!drag || drag.pointer !== event.pointerId) return;
		const from = draft.findIndex((f) => f.id === drag.id);
		// The row whose middle the pointer has passed decides the place.
		let to = from;
		draft.forEach((f, i) => {
			const rect = rowRefs.current.get(f.id)?.getBoundingClientRect();
			if (!rect) return;
			const middle = rect.top + Math.min(rect.height, 64) / 2;
			if (i < from && event.clientY < middle) to = Math.min(to, i);
			if (i > from && event.clientY > middle) to = Math.max(to, i);
		});
		if (to !== from) tryMove(drag.id, to);
	}

	function onPointerUp(
		event: React.PointerEvent<HTMLButtonElement>,
		field: FormField,
	) {
		const drag = draggingRef.current;
		if (!drag || drag.pointer !== event.pointerId) return;
		draggingRef.current = null;
		setLifted(null);
		const index = draft.findIndex((f) => f.id === field.id);
		if (liftedFrom.current && !same(liftedFrom.current, draft))
			setAnnouncement(
				`${field.label} moved to place ${index + 1} of ${draft.length}.`,
			);
		liftedFrom.current = null;
	}

	// ---- Saving ---------------------------------------------------------------

	const openProblem = useCallback((problem: FormProblem | undefined) => {
		if (!problem?.fieldId) return;
		setOpenId(problem.fieldId);
		requestAnimationFrame(() => {
			const row = rowRefs.current.get(problem.fieldId ?? "");
			row?.scrollIntoView({ block: "start", behavior: "smooth" });
			row
				?.querySelector<HTMLElement>("[aria-invalid='true']")
				?.focus({ preventScroll: true });
		});
	}, []);

	const save = useCallback(async (): Promise<boolean> => {
		if (problems.length > 0) {
			openProblem(problems.find((p) => p.fieldId) ?? problems[0]);
			setStatus({
				kind: "error",
				message:
					problems.length === 1
						? "Fix the problem marked below to save."
						: `Fix the ${problems.length} problems marked below to save.`,
			});
			return false;
		}
		const result = await saveForm(eventId, version, draft);
		if (result.ok) {
			setSaved(draft);
			setVersion(result.version);
			setStatus({ kind: "saved" });
			router.refresh();
			return true;
		}
		if (result.reason === "invalid") openProblem(result.problem);
		setStatus({
			kind: "error",
			message: result.message,
			reload: result.reason === "conflict",
		});
		return false;
	}, [problems, openProblem, eventId, version, draft, router, setSaved]);

	useUnsavedChanges(dirty, save);

	// ---- Rendering --------------------------------------------------------------

	const existingLabels = useMemo(
		() => new Set(draft.map((f) => fold(f.label))),
		[draft],
	);
	const full = draft.length >= FORM_LIMITS.fields;
	const formProblem = problems.find((p) => p.fieldId === null);
	const questions = draft.filter((f) => FIELD_KIND_INFO[f.kind].answers).length;

	return (
		<div className={styles.frame}>
			<div className={styles.layout}>
				<section className={styles.builder} aria-labelledby={`${id}title`}>
					<header className={styles.head}>
						<div className={styles.headText}>
							<h3 className={styles.title} id={`${id}title`}>
								Registration form
							</h3>
							<p className={styles.lead}>
								What guests answer when they register, in this order
							</p>
						</div>
						<p className={styles.count}>
							{questions} {questions === 1 ? "question" : "questions"}
							<span className={styles.countLimit}>
								{" "}
								{draft.length} of {FORM_LIMITS.fields} fields
							</span>
						</p>
						<button
							type="button"
							className={`${styles.secondary} ${styles.previewButton}`}
							onClick={() => setPreviewOpen(true)}
						>
							Preview
						</button>
					</header>

					{registered > 0 ? (
						<p className={styles.banner}>
							<AlertIcon />
							{registered} {registered === 1 ? "person has" : "people have"}{" "}
							registered. Changes apply to people who register from now on.
						</p>
					) : null}

					<p className={styles.srOnly} id={`${id}dragHelp`}>
						Press Space to pick up, arrows to move, Space to drop.
					</p>

					<div className={styles.sheet}>
						<ol className={styles.list} aria-label="Fields, in order">
							{draft.map((field, index) => {
								const open = openId === field.id;
								const fieldProblems = problemsBy.get(field.id) ?? [];
								const rule = describeShowIf(field, draft, tickets);
								const label = field.label.trim() || "Untitled question";
								const info = FIELD_KIND_INFO[field.kind];
								return (
									<li
										key={field.id}
										ref={(node) => {
											if (node) rowRefs.current.set(field.id, node);
											else rowRefs.current.delete(field.id);
										}}
										className={styles.row}
										data-open={open || undefined}
										data-branch={field.showIf ? true : undefined}
										data-lifted={lifted === field.id || undefined}
										data-heading={field.kind === "heading" || undefined}
									>
										<div className={styles.rowHead}>
											<button
												type="button"
												ref={(node) => {
													if (node) handleRefs.current.set(field.id, node);
													else handleRefs.current.delete(field.id);
												}}
												className={styles.handle}
												aria-describedby={`${id}dragHelp`}
												aria-pressed={lifted === field.id}
												onKeyDown={(event) => onHandleKey(event, field, index)}
												onPointerDown={(event) => onPointerDown(event, field)}
												onPointerMove={onPointerMove}
												onPointerUp={(event) => onPointerUp(event, field)}
												onPointerCancel={(event) => onPointerUp(event, field)}
												onBlur={() => {
													if (lifted === field.id && !draggingRef.current) {
														setLifted(null);
														liftedFrom.current = null;
													}
												}}
											>
												<GripIcon />
												<span className={styles.srOnly}>Move {label}</span>
											</button>

											<button
												type="button"
												className={styles.rowMain}
												aria-expanded={open}
												aria-controls={`${id}${field.id}`}
												onClick={() => setOpenId(open ? null : field.id)}
											>
												<span
													className={styles.kindTile}
													data-kind={field.kind}
												>
													<KindIcon kind={field.kind} />
												</span>
												<span className={styles.rowText}>
													<span className={styles.rowTitle}>
														{label}
														{field.required ? (
															<span className={styles.requiredMark}>
																<span aria-hidden="true"> *</span>
																<span className={styles.srOnly}>
																	{" "}
																	(required)
																</span>
															</span>
														) : null}
													</span>
													<span className={styles.rowMeta}>
														<span className={styles.tag}>{info.label}</span>
														{field.core ? (
															<span className={styles.tag} data-tone="lock">
																<LockIcon /> Always asked
															</span>
														) : null}
														{fieldProblems.length > 0 ? (
															<span className={styles.tag} data-tone="alert">
																<AlertIcon />
																{fieldProblems.length === 1
																	? "1 problem"
																	: `${fieldProblems.length} problems`}
															</span>
														) : null}
													</span>
													{rule ? (
														<span className={styles.rule}>
															<BranchIcon />
															{rule}
														</span>
													) : null}
												</span>
												<ChevronDownIcon className={styles.rowChevron} />
											</button>

											<div className={styles.rowTools}>
												<button
													type="button"
													className={styles.iconButton}
													disabled={full}
													title={
														full
															? `A form has at most ${FORM_LIMITS.fields} fields`
															: undefined
													}
													onClick={() =>
														insert(duplicateField(field), index + 1)
													}
												>
													<DuplicateIcon />
													<span className={styles.srOnly}>
														Duplicate {label}
													</span>
												</button>
												<button
													type="button"
													className={`${styles.iconButton} ${styles.danger}`}
													disabled={Boolean(field.core)}
													title={
														field.core
															? `Every guest gives their ${field.core}`
															: undefined
													}
													onClick={() => askRemove(field)}
												>
													<TrashIcon />
													<span className={styles.srOnly}>
														{field.core
															? `${label} can't be deleted`
															: `Delete ${label}`}
													</span>
												</button>
											</div>
										</div>

										<div id={`${id}${field.id}`} hidden={!open}>
											{open ? (
												<FieldEditor
													field={field}
													fields={draft}
													index={index}
													tickets={tickets}
													problems={fieldProblems}
													hasAnswers={answeredSet.has(field.id)}
													onChange={update}
													labelRef={(node: HTMLInputElement | null) => {
														if (node) labelRefs.current.set(field.id, node);
														else labelRefs.current.delete(field.id);
													}}
												/>
											) : null}
										</div>
									</li>
								);
							})}
						</ol>

						<div className={styles.sheetFoot}>
							<button
								type="button"
								className={styles.addButton}
								disabled={full}
								onClick={() => setAdding(true)}
							>
								<PlusIcon />
								Add a field
							</button>
							{full ? (
								<p className={styles.hint}>
									A form has at most {FORM_LIMITS.fields} fields. Remove one to
									add another.
								</p>
							) : null}
						</div>
					</div>
				</section>

				<aside className={styles.side} aria-label="Guest preview">
					<FormPreview
						fields={draft}
						tickets={tickets}
						eventTitle={eventTitle}
					/>
				</aside>
			</div>

			{dirty || status ? (
				<SaveBar
					className={styles.saveBarPlace}
					message={
						status?.kind === "error"
							? {
									tone: "error",
									text: (
										<>
											{status.message}
											{status.reload ? (
												<>
													{" "}
													<button
														type="button"
														className={styles.inlineButton}
														onClick={() => window.location.reload()}
													>
														Reload
													</button>
												</>
											) : null}
										</>
									),
								}
							: status?.kind === "saved" && !dirty
								? { tone: "saved" }
								: !online
									? {
											tone: "error",
											text: "You're offline. Your changes are kept here; save when you're back.",
										}
									: formProblem
										? { tone: "error", text: formProblem.message }
										: { tone: "plain", text: "You have unsaved changes" }
					}
					dirty={dirty}
					pending={pending}
					canSave={online}
					onDiscard={() => {
						setDraft(saved);
						setStatus(null);
						setOpenId(null);
						setAnnouncement("Changes discarded.");
					}}
					onSave={() => startTransition(async () => void (await save()))}
				/>
			) : null}

			<p className={styles.srOnly} aria-live="polite">
				{announcement}
			</p>

			<AddFieldDialog
				open={adding}
				onClose={() => setAdding(false)}
				existingLabels={existingLabels}
				onAdd={(field) => {
					// Below the open field, so a question lands where the host is
					// working; otherwise at the end.
					const at = openId
						? draft.findIndex((f) => f.id === openId) + 1
						: draft.length;
					insert(field, at > 0 ? at : draft.length);
				}}
			/>

			<Popup
				open={confirm !== null}
				onClose={() => setConfirm(null)}
				title={confirm ? `Delete ${confirm.label}?` : ""}
				className={styles.dialogSmall}
			>
				{confirm ? (
					<RemoveBody
						field={confirm}
						dependents={dependentsOf(draft, confirm.id)}
						onCancel={() => setConfirm(null)}
						onConfirm={() => {
							remove(confirm);
							setConfirm(null);
						}}
					/>
				) : null}
			</Popup>

			<Popup
				open={previewOpen}
				onClose={() => setPreviewOpen(false)}
				title="Guest preview"
				className={styles.previewDialog}
			>
				<FormPreview
					fields={draft}
					tickets={tickets}
					eventTitle={eventTitle}
					titled={false}
				/>
			</Popup>
		</div>
	);
}

/** Deleting a question others depend on: says which, and what happens to them. */
function RemoveBody({
	field,
	dependents,
	onCancel,
	onConfirm,
}: {
	field: FormField;
	dependents: FormField[];
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<>
			<div className={styles.dialogText}>
				<p>
					{dependents.length === 1
						? "This question decides when another one shows:"
						: `This question decides when ${dependents.length} others show:`}
				</p>
				<ul className={styles.dependents}>
					{dependents.map((d) => (
						<li key={d.id}>{d.label}</li>
					))}
				</ul>
				<p>
					Their conditions on {field.label} are removed too, so{" "}
					{dependents.length === 1 ? "it shows" : "they show"} to every guest
					unless {dependents.length === 1 ? "it has" : "they have"} other
					conditions.
				</p>
			</div>
			<div className={styles.dialogActions}>
				<button type="button" className={styles.secondary} onClick={onCancel}>
					Keep it
				</button>
				<button
					type="button"
					className={`${styles.secondary} ${styles.discard}`}
					onClick={onConfirm}
				>
					Delete
				</button>
			</div>
		</>
	);
}
