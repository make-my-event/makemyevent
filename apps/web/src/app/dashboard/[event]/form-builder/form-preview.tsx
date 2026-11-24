"use client";

import {
	type Answer,
	answersProblems,
	FIELD_KIND_INFO,
	type FormField,
	OTHER_OPTION,
	visibleFields,
} from "@makemyevent/core";
import { useId, useMemo, useState } from "react";
import { AlertIcon } from "./kind-icon";
import styles from "./form-builder.module.css";

type Ticket = { id: string; name: string };

function localToday(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The form as a guest meets it, from the draft, unsaved edits included.
 * Answer it and the "Show if" rules show and hide questions as they will
 * for guests; "Try registering" checks the answers the way registration
 * will. Nothing here is sent anywhere.
 */
export function FormPreview({
	fields,
	tickets,
	eventTitle,
	titled = true,
}: {
	fields: readonly FormField[];
	tickets: readonly Ticket[];
	eventTitle: string;
	/** False inside a popup that already says "Guest preview". */
	titled?: boolean;
}) {
	const id = useId();
	const [answers, setAnswers] = useState<Record<string, Answer>>({});
	const [other, setOther] = useState<Record<string, string>>({});
	const [ticketId, setTicketId] = useState<string | null>(
		tickets[0]?.id ?? null,
	);
	const [tried, setTried] = useState(false);

	const shown = useMemo(
		() => visibleFields(fields, answers, ticketId),
		[fields, answers, ticketId],
	);
	const problems = useMemo(
		() => answersProblems(fields, answers, ticketId, localToday(), other),
		[fields, answers, ticketId, other],
	);
	const set = (fieldId: string, value: Answer) =>
		setAnswers((current) => ({ ...current, [fieldId]: value }));
	const hidden = fields.filter(
		(f) => !shown.has(f.id) && FIELD_KIND_INFO[f.kind].answers,
	).length;

	return (
		<section
			className={styles.preview}
			aria-labelledby={titled ? `${id}title` : undefined}
		>
			<header className={styles.previewHead}>
				<div>
					{titled ? (
						<h3 className={styles.previewTitle} id={`${id}title`}>
							Guest preview
						</h3>
					) : null}
					<p className={styles.previewLead}>
						Try it: answers here show and hide questions. Nothing is sent.
					</p>
				</div>
				<button
					type="button"
					className={styles.textButton}
					onClick={() => {
						setAnswers({});
						setOther({});
						setTried(false);
					}}
				>
					Clear answers
				</button>
			</header>

			<div className={styles.previewSheet}>
				<p className={styles.previewEvent}>Register for {eventTitle}</p>

				{tickets.length > 1 ? (
					<div className={styles.previewField}>
						<label className={styles.label} htmlFor={`${id}ticket`}>
							Ticket
						</label>
						<select
							id={`${id}ticket`}
							className={styles.select}
							value={ticketId ?? ""}
							onChange={(event) => setTicketId(event.target.value)}
						>
							{tickets.map((ticket) => (
								<option key={ticket.id} value={ticket.id}>
									{ticket.name}
								</option>
							))}
						</select>
					</div>
				) : null}

				{fields.map((field) =>
					shown.has(field.id) ? (
						<PreviewField
							key={field.id}
							field={field}
							answer={answers[field.id] ?? null}
							otherText={other[field.id] ?? ""}
							problem={tried ? (problems.get(field.id) ?? null) : null}
							onAnswer={(value) => set(field.id, value)}
							onOther={(text) =>
								setOther((current) => ({ ...current, [field.id]: text }))
							}
						/>
					) : null,
				)}

				<div className={styles.previewFoot}>
					<button
						type="button"
						className={styles.primary}
						onClick={() => setTried(true)}
					>
						Try registering
					</button>
					<p className={styles.previewResult} role="status">
						{tried
							? problems.size === 0
								? "Every answer passes. In the real form, this registers them."
								: `${problems.size} ${problems.size === 1 ? "answer needs" : "answers need"} attention.`
							: hidden > 0
								? `${hidden} ${hidden === 1 ? "question is" : "questions are"} hidden by "Show if" rules.`
								: ""}
					</p>
				</div>
			</div>
		</section>
	);
}

/**
 * One question as a guest answers it: label, help, the right input for its
 * kind, "Other" when chosen, and its problem. Used by the preview here and
 * by Invite guest and Edit submission on the Guests tab.
 */
export function PreviewField({
	field,
	answer,
	otherText,
	problem,
	onAnswer,
	onOther,
}: {
	field: FormField;
	answer: Answer;
	otherText: string;
	problem: string | null;
	onAnswer: (value: Answer) => void;
	onOther: (text: string) => void;
}) {
	const id = useId();
	const s = field.settings;
	const label = (
		<>
			{field.label || "Untitled question"}
			{field.required ? (
				<span className={styles.requiredMark}>
					<span aria-hidden="true"> *</span>
					<span className={styles.srOnly}> (required)</span>
				</span>
			) : null}
		</>
	);
	const help = field.help ? (
		<p className={styles.previewHelp} id={`${id}help`}>
			{field.help}
		</p>
	) : null;
	const error = problem ? (
		<p className={styles.fieldError} id={`${id}error`}>
			<AlertIcon />
			{problem}
		</p>
	) : null;
	const describedBy =
		[field.help ? `${id}help` : "", problem ? `${id}error` : ""]
			.filter(Boolean)
			.join(" ") || undefined;
	const text = typeof answer === "string" ? answer : "";

	if (field.kind === "heading")
		return (
			<div className={styles.previewHeading}>
				<h4 className={styles.previewHeadingTitle}>{field.label}</h4>
				{help}
			</div>
		);

	if (field.kind === "consent")
		return (
			<div className={styles.previewField} data-appear>
				<label className={styles.consent}>
					<input
						type="checkbox"
						checked={answer === true}
						aria-invalid={problem ? true : undefined}
						aria-describedby={describedBy}
						onChange={(event) => onAnswer(event.target.checked)}
					/>
					<span>
						{label}
						{s.linkUrl ? (
							<>
								{" "}
								<a href={s.linkUrl} target="_blank" rel="noopener noreferrer">
									Read it
								</a>
							</>
						) : null}
					</span>
				</label>
				{help}
				{error}
			</div>
		);

	const choices = (s.options ?? []).map((o) => ({
		id: o.id,
		label: o.label || "Untitled option",
	}));
	if (s.allowOther) choices.push({ id: OTHER_OPTION, label: "Other" });
	const otherBox = (picked: boolean) =>
		picked ? (
			<input
				className={styles.input}
				aria-label={`${field.label}: other`}
				placeholder="Write your answer"
				value={otherText}
				onChange={(event) => onOther(event.target.value)}
			/>
		) : null;

	if (
		field.kind === "radio" ||
		field.kind === "checkboxes" ||
		field.kind === "yes_no"
	) {
		const many = field.kind === "checkboxes";
		const list =
			field.kind === "yes_no"
				? [
						{ id: "yes", label: "Yes" },
						{ id: "no", label: "No" },
					]
				: choices;
		const picked = many ? (Array.isArray(answer) ? answer : []) : [text];
		return (
			<fieldset
				className={styles.previewField}
				aria-describedby={describedBy}
				data-appear
			>
				<legend className={styles.label}>{label}</legend>
				{help}
				<div
					className={field.kind === "yes_no" ? styles.yesNo : styles.choiceList}
				>
					{list.map((choice) => (
						<label key={choice.id} className={styles.choice}>
							<input
								type={many ? "checkbox" : "radio"}
								name={id}
								checked={picked.includes(choice.id)}
								aria-invalid={problem ? true : undefined}
								onChange={(event) => {
									if (!many) onAnswer(choice.id);
									else
										onAnswer(
											event.target.checked
												? [...picked, choice.id]
												: picked.filter((p) => p !== choice.id),
										);
								}}
							/>
							{choice.label}
						</label>
					))}
				</div>
				{otherBox(picked.includes(OTHER_OPTION))}
				{error}
			</fieldset>
		);
	}

	return (
		<div className={styles.previewField} data-appear>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			{help}
			{field.kind === "select" ? (
				<>
					<select
						id={id}
						className={styles.select}
						value={text}
						aria-invalid={problem ? true : undefined}
						aria-describedby={describedBy}
						onChange={(event) => onAnswer(event.target.value || null)}
					>
						<option value="">{field.placeholder || "Choose…"}</option>
						{choices.map((choice) => (
							<option key={choice.id} value={choice.id}>
								{choice.label}
							</option>
						))}
					</select>
					{otherBox(text === OTHER_OPTION)}
				</>
			) : field.kind === "long_text" ? (
				<textarea
					id={id}
					className={`${styles.input} ${styles.textarea}`}
					rows={3}
					placeholder={field.placeholder}
					value={text}
					aria-invalid={problem ? true : undefined}
					aria-describedby={describedBy}
					onChange={(event) => onAnswer(event.target.value)}
				/>
			) : field.kind === "file" ? (
				<input
					id={id}
					className={styles.file}
					type="file"
					accept={(s.accept ?? [])
						.map((t) =>
							t === "pdf"
								? "application/pdf"
								: "image/jpeg,image/png,image/webp",
						)
						.join(",")}
					aria-describedby={describedBy}
					onChange={(event) => onAnswer(event.target.files?.[0]?.name ?? null)}
				/>
			) : (
				<input
					id={id}
					className={styles.input}
					type={
						field.kind === "email"
							? "email"
							: field.kind === "phone"
								? "tel"
								: field.kind === "url"
									? "url"
									: field.kind === "date"
										? "date"
										: "text"
					}
					inputMode={
						field.kind === "number"
							? "decimal"
							: field.kind === "phone"
								? "tel"
								: field.kind === "email"
									? "email"
									: field.kind === "url"
										? "url"
										: undefined
					}
					autoComplete={
						field.core === "name"
							? "name"
							: field.kind === "email"
								? "email"
								: field.kind === "phone"
									? "tel"
									: "off"
					}
					placeholder={field.placeholder}
					value={text}
					aria-invalid={problem ? true : undefined}
					aria-describedby={describedBy}
					onChange={(event) => onAnswer(event.target.value)}
				/>
			)}
			{error}
		</div>
	);
}
