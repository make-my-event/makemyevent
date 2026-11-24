"use client";

import { ChevronDownIcon, CloseIcon } from "@/components/icons";
import {
	canChangeKind,
	changeKind,
	FIELD_KIND_INFO,
	type FieldKind,
	type FieldOption,
	type FieldSettings,
	FILE_TYPES,
	FORM_LIMITS,
	type FormField,
	type FormProblem,
	hasOptions,
	newOptionId,
	type ShowIf,
} from "@makemyevent/core";
import { useId, useRef, useState } from "react";
import { describeShowIf } from "./describe";
import { AlertIcon, BranchIcon, LockIcon } from "./kind-icon";
import styles from "./form-builder.module.css";
import { ShowIfEditor } from "./show-if-editor";

type Ticket = { id: string; name: string };

/** The type picker's groups, in the order a host thinks of them. */
const KIND_GROUPS: readonly { label: string; kinds: readonly FieldKind[] }[] = [
	{ label: "Text", kinds: ["short_text", "long_text"] },
	{ label: "Contact", kinds: ["email", "phone", "url"] },
	{ label: "Choices", kinds: ["select", "radio", "checkboxes", "yes_no"] },
	{ label: "Other answers", kinds: ["number", "date", "file", "consent"] },
	{ label: "Layout", kinds: ["heading"] },
];

const HAS_VALIDATION: ReadonlySet<FieldKind> = new Set([
	"short_text",
	"long_text",
	"number",
	"checkboxes",
	"date",
	"email",
	"url",
	"file",
	"consent",
]);

/**
 * One field's settings, opened under its row: the wording, the kind, the
 * options for a choice, whether it is required, its validation, and when it
 * shows. Every change goes to the draft at once; nothing here saves.
 */
export function FieldEditor({
	field,
	fields,
	index,
	tickets,
	problems,
	hasAnswers,
	onChange,
	labelRef,
}: {
	field: FormField;
	fields: readonly FormField[];
	index: number;
	tickets: readonly Ticket[];
	problems: readonly FormProblem[];
	hasAnswers: boolean;
	onChange: (field: FormField) => void;
	labelRef: React.Ref<HTMLInputElement>;
}) {
	const id = useId();
	const info = FIELD_KIND_INFO[field.kind];
	const at = (area: FormProblem["area"]) =>
		problems.filter((p) => p.area === area);
	const labelProblem = at("label")[0];
	const showIfProblems = at("showIf");
	const validationProblem = at("validation")[0];
	const [validationOpen, setValidationOpen] = useState(
		Boolean(validationProblem),
	);
	const [showIfOpen, setShowIfOpen] = useState(
		Boolean(field.showIf) || showIfProblems.length > 0,
	);
	const set = (patch: Partial<FormField>) => onChange({ ...field, ...patch });
	// An emptied limit is no key at all, as saved, so clearing a box you
	// filled leaves the form unchanged.
	const setSettings = (patch: Partial<FieldSettings>) => {
		const settings: FieldSettings = { ...field.settings, ...patch };
		for (const key of Object.keys(settings) as (keyof FieldSettings)[]) {
			const value = settings[key];
			if (
				value === null ||
				value === false ||
				(Array.isArray(value) &&
					value.length === 0 &&
					key !== "options" &&
					key !== "accept")
			)
				delete settings[key];
		}
		onChange({ ...field, settings });
	};
	const rule = describeShowIf(field, fields, tickets);

	return (
		<div className={styles.editor}>
			<div className={styles.editorGrid}>
				<div className={styles.field}>
					<label className={styles.label} htmlFor={`${id}label`}>
						{field.kind === "heading"
							? "Section title"
							: field.kind === "consent"
								? "What they agree to"
								: "Question"}
					</label>
					<input
						ref={labelRef}
						id={`${id}label`}
						className={styles.input}
						value={field.label}
						maxLength={FORM_LIMITS.label}
						aria-invalid={labelProblem ? true : undefined}
						aria-describedby={labelProblem ? `${id}labelError` : undefined}
						onChange={(event) => set({ label: event.target.value })}
					/>
					{labelProblem ? (
						<p className={styles.fieldError} id={`${id}labelError`}>
							<AlertIcon />
							{labelProblem.message}
						</p>
					) : null}
				</div>

				<div className={styles.field}>
					<label className={styles.label} htmlFor={`${id}kind`}>
						Field type
					</label>
					<select
						id={`${id}kind`}
						className={styles.select}
						value={field.kind}
						disabled={Boolean(field.core)}
						aria-describedby={field.core ? `${id}kindNote` : undefined}
						onChange={(event) =>
							onChange(changeKind(field, event.target.value as FieldKind))
						}
					>
						{KIND_GROUPS.map((group) => (
							<optgroup key={group.label} label={group.label}>
								{group.kinds.map((kind) => (
									<option
										key={kind}
										value={kind}
										disabled={!canChangeKind(field, kind, hasAnswers)}
									>
										{FIELD_KIND_INFO[kind].label}
									</option>
								))}
							</optgroup>
						))}
					</select>
					{field.core ? (
						<p className={styles.hint} id={`${id}kindNote`}>
							<LockIcon /> Registration needs every guest's {field.core}, so
							this field stays.
						</p>
					) : hasAnswers ? (
						<p className={styles.hint}>
							Guests have answered this, so it can only change to a similar
							type.
						</p>
					) : null}
				</div>

				{info.placeholder ? (
					<div className={styles.field}>
						<label className={styles.label} htmlFor={`${id}placeholder`}>
							Placeholder <span className={styles.optional}>optional</span>
						</label>
						<input
							id={`${id}placeholder`}
							className={styles.input}
							value={field.placeholder}
							maxLength={FORM_LIMITS.placeholder}
							placeholder="Shown faintly in the empty box"
							onChange={(event) => set({ placeholder: event.target.value })}
						/>
					</div>
				) : null}

				<div
					className={`${styles.field} ${info.placeholder ? "" : styles.wide}`}
				>
					<label className={styles.label} htmlFor={`${id}help`}>
						{field.kind === "heading" ? "Note under it" : "Help text"}{" "}
						<span className={styles.optional}>optional</span>
					</label>
					<input
						id={`${id}help`}
						className={styles.input}
						value={field.help}
						maxLength={FORM_LIMITS.help}
						placeholder={
							field.kind === "heading"
								? "What this part of the form is about"
								: "Why you ask, or how to answer"
						}
						onChange={(event) => set({ help: event.target.value })}
					/>
				</div>
			</div>

			{hasOptions(field.kind) ? (
				<OptionsEditor
					field={field}
					fields={fields}
					problem={at("options")[0]}
					onChange={(settings) => setSettings(settings)}
				/>
			) : null}

			{info.answers ? (
				<div className={styles.switchRow}>
					<button
						type="button"
						role="switch"
						aria-checked={field.required}
						aria-labelledby={`${id}req`}
						aria-describedby={field.core ? `${id}reqNote` : undefined}
						className={styles.switch}
						disabled={Boolean(field.core)}
						onClick={() => set({ required: !field.required })}
					>
						<span className={styles.switchThumb} />
					</button>
					<span id={`${id}req`} className={styles.switchLabel}>
						{field.kind === "consent"
							? "Must be ticked to register"
							: "Required"}
					</span>
					{field.core ? (
						<span className={styles.hint} id={`${id}reqNote`}>
							<LockIcon /> Always required
						</span>
					) : field.showIf && field.required ? (
						<span className={styles.hint}>Only while it's shown</span>
					) : null}
				</div>
			) : null}

			{HAS_VALIDATION.has(field.kind) ? (
				<Disclosure
					title="Validation"
					summary={validationSummary(field)}
					open={validationOpen}
					onToggle={() => setValidationOpen((v) => !v)}
					invalid={Boolean(validationProblem)}
				>
					<ValidationEditor
						field={field}
						onChange={setSettings}
						problem={validationProblem}
					/>
				</Disclosure>
			) : null}

			<Disclosure
				title="Show if"
				icon={<BranchIcon />}
				summary={rule ? rule.replace(/^Shown if /, "") : "Always shown"}
				active={Boolean(field.showIf)}
				open={showIfOpen}
				onToggle={() => setShowIfOpen((v) => !v)}
				invalid={showIfProblems.length > 0}
			>
				<ShowIfEditor
					field={field}
					fields={fields}
					index={index}
					tickets={tickets}
					problems={showIfProblems}
					onChange={(showIf: ShowIf | null) => set({ showIf })}
				/>
			</Disclosure>
		</div>
	);
}

function Disclosure({
	title,
	icon,
	summary,
	active = false,
	open,
	onToggle,
	invalid,
	children,
}: {
	title: string;
	icon?: React.ReactNode;
	summary: string | null;
	active?: boolean;
	open: boolean;
	onToggle: () => void;
	invalid: boolean;
	children: React.ReactNode;
}) {
	const id = useId();
	return (
		<section
			className={styles.disclosure}
			data-open={open || undefined}
			data-active={active || undefined}
			data-invalid={invalid || undefined}
		>
			<h4 className={styles.disclosureHead}>
				<button
					type="button"
					className={styles.disclosureButton}
					aria-expanded={open}
					aria-controls={id}
					onClick={onToggle}
				>
					{icon ?? null}
					<span className={styles.disclosureTitle}>{title}</span>
					{summary ? (
						<span className={styles.disclosureSummary}>{summary}</span>
					) : null}
					{invalid ? (
						<span className={styles.problemTag}>
							<AlertIcon /> Fix
						</span>
					) : null}
					<ChevronDownIcon className={styles.chevron} />
				</button>
			</h4>
			<div id={id} className={styles.disclosureBody} hidden={!open}>
				{children}
			</div>
		</section>
	);
}

function validationSummary(field: FormField): string | null {
	const s = field.settings;
	const parts: string[] = [];
	if (s.minLength) parts.push(`at least ${s.minLength} characters`);
	if (s.maxLength) parts.push(`up to ${s.maxLength} characters`);
	if (s.min != null) parts.push(`from ${s.min}`);
	if (s.max != null) parts.push(`up to ${s.max}`);
	if (s.integer) parts.push("whole numbers");
	if (s.minSelected) parts.push(`pick at least ${s.minSelected}`);
	if (s.maxSelected) parts.push(`pick up to ${s.maxSelected}`);
	if (s.noFuture) parts.push("not in the future");
	if (s.noPast) parts.push("not in the past");
	if (s.earliest) parts.push(`from ${s.earliest}`);
	if (s.latest) parts.push(`until ${s.latest}`);
	if (s.domains?.length) parts.push(`only ${s.domains.join(", ")}`);
	if (s.hosts?.length) parts.push(`only ${s.hosts.join(", ")}`);
	if (field.kind === "file")
		parts.push(
			`${(s.accept ?? []).map((t) => (t === "pdf" ? "PDF" : "images")).join(" or ") || "no files"}, up to ${s.maxSizeMb ?? FORM_LIMITS.fileMb} MB`,
		);
	if (s.linkUrl) parts.push("links to the terms");
	if (parts.length === 0) return "None";
	const text = parts.join(", ");
	return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---- Options ------------------------------------------------------------

function OptionsEditor({
	field,
	fields,
	problem,
	onChange,
}: {
	field: FormField;
	fields: readonly FormField[];
	problem: FormProblem | undefined;
	onChange: (settings: Partial<FieldSettings>) => void;
}) {
	const id = useId();
	const options = field.settings.options ?? [];
	const listRef = useRef<HTMLOListElement>(null);
	// Options other questions' conditions test, so removing one says so.
	const tested = new Set(
		fields.flatMap((f) =>
			(f.showIf?.conditions ?? [])
				.filter((c) => c.source === field.id)
				.flatMap((c) => (Array.isArray(c.value) ? c.value : [c.value])),
		),
	);

	const focusAt = (i: number) =>
		requestAnimationFrame(() =>
			listRef.current?.querySelectorAll<HTMLInputElement>("input")[i]?.focus(),
		);
	const setOptions = (next: FieldOption[]) => onChange({ options: next });
	const insertAfter = (i: number, labels: string[]) => {
		const room = FORM_LIMITS.options - options.length;
		const added = labels
			.slice(0, room)
			.map((label) => ({ id: newOptionId(), label }));
		if (added.length === 0) return;
		setOptions([...options.slice(0, i + 1), ...added, ...options.slice(i + 1)]);
		focusAt(i + added.length);
	};

	return (
		<fieldset className={styles.options}>
			<legend className={styles.label}>
				Options{" "}
				<span className={styles.optional}>
					{options.length} of {FORM_LIMITS.options}. Paste a list to add many at
					once.
				</span>
			</legend>
			<ol className={styles.optionList} ref={listRef}>
				{options.map((option, i) => (
					<li key={option.id} className={styles.optionRow}>
						<span
							className={styles.optionMark}
							data-kind={field.kind}
							aria-hidden="true"
						/>
						<label className={styles.srOnly} htmlFor={`${id}${option.id}`}>
							Option {i + 1}
						</label>
						<input
							id={`${id}${option.id}`}
							className={styles.input}
							value={option.label}
							maxLength={FORM_LIMITS.optionLabel}
							onChange={(event) =>
								setOptions(
									options.map((o) =>
										o.id === option.id
											? { ...o, label: event.target.value }
											: o,
									),
								)
							}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									insertAfter(i, [""]);
								} else if (
									event.key === "Backspace" &&
									option.label === "" &&
									options.length > 1 &&
									!tested.has(option.id)
								) {
									event.preventDefault();
									setOptions(options.filter((o) => o.id !== option.id));
									focusAt(Math.max(0, i - 1));
								}
							}}
							onPaste={(event) => {
								const lines = event.clipboardData
									.getData("text")
									.split(/\r?\n/)
									.map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
									.filter(Boolean);
								if (lines.length < 2) return;
								event.preventDefault();
								const [first = "", ...rest] = lines;
								const replaced = options.map((o) =>
									o.id === option.id && o.label === ""
										? { ...o, label: first }
										: o,
								);
								const room = FORM_LIMITS.options - replaced.length;
								const added = (option.label === "" ? rest : lines)
									.slice(0, room)
									.map((label) => ({ id: newOptionId(), label }));
								setOptions([
									...replaced.slice(0, i + 1),
									...added,
									...replaced.slice(i + 1),
								]);
								focusAt(i + added.length);
							}}
						/>
						<div className={styles.optionTools}>
							<button
								type="button"
								className={styles.iconButton}
								disabled={i === 0}
								onClick={() => {
									const next = [...options];
									[next[i - 1], next[i]] = [
										next[i] as FieldOption,
										next[i - 1] as FieldOption,
									];
									setOptions(next);
								}}
							>
								<ChevronDownIcon className={styles.up} />
								<span className={styles.srOnly}>
									Move {option.label || `option ${i + 1}`} up
								</span>
							</button>
							<button
								type="button"
								className={styles.iconButton}
								disabled={i === options.length - 1}
								onClick={() => {
									const next = [...options];
									[next[i + 1], next[i]] = [
										next[i] as FieldOption,
										next[i + 1] as FieldOption,
									];
									setOptions(next);
								}}
							>
								<ChevronDownIcon />
								<span className={styles.srOnly}>
									Move {option.label || `option ${i + 1}`} down
								</span>
							</button>
							<button
								type="button"
								className={styles.iconButton}
								disabled={options.length <= 1}
								title={
									tested.has(option.id)
										? "A condition uses this option; it will show a problem until changed"
										: undefined
								}
								onClick={() => {
									setOptions(options.filter((o) => o.id !== option.id));
									focusAt(Math.max(0, i - 1));
								}}
							>
								<CloseIcon />
								<span className={styles.srOnly}>
									Remove {option.label || `option ${i + 1}`}
								</span>
							</button>
						</div>
					</li>
				))}
			</ol>
			{problem ? (
				<p className={styles.fieldError}>
					<AlertIcon />
					{problem.message}
				</p>
			) : null}
			<div className={styles.optionFoot}>
				<button
					type="button"
					className={styles.textButton}
					disabled={options.length >= FORM_LIMITS.options}
					onClick={() => insertAfter(options.length - 1, [""])}
				>
					+ Add an option
				</button>
				<label className={styles.checkLine}>
					<input
						type="checkbox"
						checked={field.settings.allowOther === true}
						onChange={(event) => onChange({ allowOther: event.target.checked })}
					/>
					Add "Other", for them to write in
				</label>
			</div>
		</fieldset>
	);
}

// ---- Validation -----------------------------------------------------------

function NumberBox({
	label,
	value,
	onChange,
	step,
	min,
}: {
	label: string;
	value: number | null | undefined;
	onChange: (value: number | null) => void;
	step?: number;
	min?: number;
}) {
	const id = useId();
	return (
		<div className={styles.field}>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				className={styles.input}
				type="number"
				inputMode={step === 1 ? "numeric" : "decimal"}
				step={step ?? "any"}
				min={min}
				placeholder="No limit"
				value={value ?? ""}
				onChange={(event) => {
					const raw = event.target.value;
					const n = Number(raw);
					onChange(raw === "" || !Number.isFinite(n) ? null : n);
				}}
			/>
		</div>
	);
}

function ListBox({
	label,
	hint,
	placeholder,
	value,
	onChange,
}: {
	label: string;
	hint: string;
	placeholder: string;
	value: readonly string[];
	onChange: (value: string[]) => void;
}) {
	const id = useId();
	// What they type, kept as typed while they type; the list is read from it.
	const [text, setText] = useState(value.join(", "));
	return (
		<div className={`${styles.field} ${styles.wide}`}>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				className={styles.input}
				value={text}
				placeholder={placeholder}
				aria-describedby={`${id}hint`}
				autoCapitalize="none"
				spellCheck={false}
				onChange={(event) => {
					setText(event.target.value);
					onChange(
						event.target.value
							.split(/[\s,;]+/)
							.map((part) =>
								part
									.trim()
									.toLowerCase()
									.replace(/^@/, "")
									.replace(/^https?:\/\//, "")
									.replace(/\/.*$/, ""),
							)
							.filter(Boolean),
					);
				}}
			/>
			<p className={styles.hint} id={`${id}hint`}>
				{hint}
			</p>
		</div>
	);
}

function CheckLine({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className={styles.checkLine}>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			{label}
		</label>
	);
}

function ValidationEditor({
	field,
	onChange,
	problem,
}: {
	field: FormField;
	onChange: (settings: Partial<FieldSettings>) => void;
	problem: FormProblem | undefined;
}) {
	const id = useId();
	const s = field.settings;
	let body: React.ReactNode = null;
	switch (field.kind) {
		case "short_text":
		case "long_text":
			body = (
				<>
					<NumberBox
						label="At least, characters"
						step={1}
						min={0}
						value={s.minLength}
						onChange={(minLength) => onChange({ minLength })}
					/>
					<NumberBox
						label={`At most, characters (up to ${field.kind === "short_text" ? FORM_LIMITS.shortText : FORM_LIMITS.longText})`}
						step={1}
						min={1}
						value={s.maxLength}
						onChange={(maxLength) => onChange({ maxLength })}
					/>
				</>
			);
			break;
		case "number":
			body = (
				<>
					<NumberBox
						label="Smallest"
						value={s.min}
						onChange={(min) => onChange({ min })}
					/>
					<NumberBox
						label="Largest"
						value={s.max}
						onChange={(max) => onChange({ max })}
					/>
					<CheckLine
						label="Whole numbers only"
						checked={s.integer === true}
						onChange={(integer) => onChange({ integer })}
					/>
				</>
			);
			break;
		case "checkboxes":
			body = (
				<>
					<NumberBox
						label="Pick at least"
						step={1}
						min={0}
						value={s.minSelected}
						onChange={(minSelected) => onChange({ minSelected })}
					/>
					<NumberBox
						label="Pick at most"
						step={1}
						min={1}
						value={s.maxSelected}
						onChange={(maxSelected) => onChange({ maxSelected })}
					/>
				</>
			);
			break;
		case "date":
			body = (
				<>
					<div className={styles.field}>
						<label className={styles.label} htmlFor={`${id}from`}>
							Earliest
						</label>
						<input
							id={`${id}from`}
							className={styles.input}
							type="date"
							value={s.earliest ?? ""}
							onChange={(e) => onChange({ earliest: e.target.value || null })}
						/>
					</div>
					<div className={styles.field}>
						<label className={styles.label} htmlFor={`${id}to`}>
							Latest
						</label>
						<input
							id={`${id}to`}
							className={styles.input}
							type="date"
							value={s.latest ?? ""}
							onChange={(e) => onChange({ latest: e.target.value || null })}
						/>
					</div>
					<CheckLine
						label="Not in the future (a birthday, say)"
						checked={s.noFuture === true}
						onChange={(noFuture) => onChange({ noFuture })}
					/>
					<CheckLine
						label="Not in the past"
						checked={s.noPast === true}
						onChange={(noPast) => onChange({ noPast })}
					/>
				</>
			);
			break;
		case "email":
			body = (
				<ListBox
					label="Only addresses at"
					hint="Leave empty for any address. Subdomains count: cet.ac.in also allows cs.cet.ac.in."
					placeholder="cet.ac.in, company.com"
					value={s.domains ?? []}
					onChange={(domains) => onChange({ domains })}
				/>
			);
			break;
		case "url":
			body = (
				<ListBox
					label="Only links on"
					hint="Leave empty for any https link."
					placeholder="linkedin.com, github.com"
					value={s.hosts ?? []}
					onChange={(hosts) => onChange({ hosts })}
				/>
			);
			break;
		case "file":
			body = (
				<>
					<fieldset className={`${styles.pickSet} ${styles.wide}`}>
						<legend className={styles.label}>They can upload</legend>
						{FILE_TYPES.map((type) => (
							<label key={type} className={styles.pick}>
								<input
									type="checkbox"
									checked={s.accept?.includes(type) ?? false}
									onChange={(event) =>
										onChange({
											accept: event.target.checked
												? FILE_TYPES.filter(
														(t) => t === type || s.accept?.includes(t),
													)
												: (s.accept ?? []).filter((t) => t !== type),
										})
									}
								/>
								{type === "pdf" ? "PDF" : "Images (JPG, PNG, WebP)"}
							</label>
						))}
					</fieldset>
					<NumberBox
						label={`Size limit, MB (1 to ${FORM_LIMITS.fileMb})`}
						step={1}
						min={1}
						value={s.maxSizeMb}
						onChange={(maxSizeMb) =>
							onChange({ maxSizeMb: maxSizeMb ?? FORM_LIMITS.fileMb })
						}
					/>
				</>
			);
			break;
		case "consent":
			body = (
				<div className={`${styles.field} ${styles.wide}`}>
					<label className={styles.label} htmlFor={`${id}link`}>
						Link to the terms <span className={styles.optional}>optional</span>
					</label>
					<input
						id={`${id}link`}
						className={styles.input}
						type="url"
						inputMode="url"
						placeholder="https://yourevent.com/code-of-conduct"
						value={s.linkUrl ?? ""}
						onChange={(event) =>
							onChange({ linkUrl: event.target.value || null })
						}
					/>
				</div>
			);
			break;
		default:
			body = null;
	}
	return (
		<div className={styles.validation}>
			{body}
			{problem ? (
				<p className={`${styles.fieldError} ${styles.wide}`}>
					<AlertIcon />
					{problem.message}
				</p>
			) : null}
		</div>
	);
}
