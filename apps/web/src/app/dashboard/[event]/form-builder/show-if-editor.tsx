"use client";

import { CloseIcon } from "@/components/icons";
import {
	type Condition,
	type ConditionOp,
	FIELD_KIND_INFO,
	FORM_LIMITS,
	type FormField,
	type FormProblem,
	OP_INFO,
	opsFor,
	type ShowIf,
	TICKET_SOURCE,
} from "@makemyevent/core";
import { useId } from "react";
import { AlertIcon } from "./kind-icon";
import styles from "./form-builder.module.css";

type Ticket = { id: string; name: string };

type Source = {
	id: string;
	label: string;
	ops: readonly ConditionOp[];
	options: readonly { id: string; label: string }[];
};

/** What a condition can test: the questions above this one, and the ticket. */
export function sourcesFor(
	fields: readonly FormField[],
	index: number,
	tickets: readonly Ticket[],
): Source[] {
	const sources: Source[] = [];
	if (tickets.length > 0)
		sources.push({
			id: TICKET_SOURCE,
			label: "Ticket",
			ops: opsFor(TICKET_SOURCE),
			options: tickets.map((t) => ({ id: t.id, label: t.name })),
		});
	for (const field of fields.slice(0, index)) {
		if (!FIELD_KIND_INFO[field.kind].answers) continue;
		sources.push({
			id: field.id,
			label: field.label.trim() || "Untitled question",
			ops: opsFor(field.kind),
			options: field.settings.options ?? [],
		});
	}
	return sources;
}

function freshValue(op: ConditionOp, source: Source): Condition["value"] {
	switch (OP_INFO[op].value) {
		case "option":
			return source.options[0]?.id ?? null;
		case "options":
			return [];
		case "number":
			return null;
		case "date":
		case "text":
			return "";
		case "none":
			return null;
	}
}

function newCondition(source: Source): Condition {
	const op = source.ops[0] ?? "filled";
	return { source: source.id, op, value: freshValue(op, source) };
}

/**
 * "Show if": off, or up to five conditions matched by all or any. Each
 * condition picks a question above this one (or the ticket), a test that
 * fits that question, and a value of the right kind. Problems show on the
 * condition they belong to, in words.
 */
export function ShowIfEditor({
	field,
	fields,
	index,
	tickets,
	problems,
	onChange,
}: {
	field: FormField;
	fields: readonly FormField[];
	index: number;
	tickets: readonly Ticket[];
	problems: readonly FormProblem[];
	onChange: (showIf: ShowIf | null) => void;
}) {
	const id = useId();
	const sources = sourcesFor(fields, index, tickets);
	const showIf = field.showIf;

	if (field.core)
		return (
			<p className={styles.note}>
				Name and email are asked of everyone, so they can't depend on anything.
			</p>
		);

	if (!showIf && sources.length === 0)
		return (
			<p className={styles.note}>
				A question can depend on answers above it. Move this one lower, or add a
				question above it, to show it only when it applies.
			</p>
		);

	const update = (conditions: Condition[]) =>
		onChange(
			conditions.length ? { match: showIf?.match ?? "all", conditions } : null,
		);
	const setCondition = (i: number, next: Condition) =>
		update((showIf?.conditions ?? []).map((c, j) => (j === i ? next : c)));
	const general = problems.find((p) => p.index === undefined);

	return (
		<div className={styles.showIf}>
			<div className={styles.switchRow}>
				<button
					type="button"
					role="switch"
					aria-checked={showIf !== null}
					aria-labelledby={`${id}on`}
					className={styles.switch}
					disabled={sources.length === 0 && !showIf}
					onClick={() => {
						const first = sources[sources.length - 1];
						onChange(
							showIf || !first
								? null
								: { match: "all", conditions: [newCondition(first)] },
						);
					}}
				>
					<span className={styles.switchThumb} />
				</button>
				<span id={`${id}on`} className={styles.switchLabel}>
					Only show this question when…
				</span>
			</div>

			{showIf ? (
				<>
					{showIf.conditions.length > 1 ? (
						<fieldset className={styles.match}>
							<legend className={styles.matchLead}>Show it when</legend>
							<div className={styles.segment}>
								{(["all", "any"] as const).map((match) => (
									<label key={match} className={styles.segmentOption}>
										<input
											type="radio"
											name={`${id}match`}
											checked={showIf.match === match}
											onChange={() => onChange({ ...showIf, match })}
										/>
										{match === "all" ? "All" : "Any"}
									</label>
								))}
							</div>
							<span className={styles.matchLead}>of these are true</span>
						</fieldset>
					) : null}

					<ol className={styles.conditions}>
						{showIf.conditions.map((condition, i) => {
							const source = sources.find((s) => s.id === condition.source);
							const problem = problems.find((p) => p.index === i);
							const rowId = `${id}c${i}`;
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: conditions have no ids; their place is who they are
								<li key={i} className={styles.condition}>
									{i > 0 ? (
										<span className={styles.joiner} aria-hidden="true">
											{showIf.match === "all" ? "and" : "or"}
										</span>
									) : null}
									<div className={styles.conditionRow}>
										<label className={styles.srOnly} htmlFor={`${rowId}s`}>
											Condition {i + 1}: question
										</label>
										<select
											id={`${rowId}s`}
											className={styles.select}
											value={source ? condition.source : ""}
											aria-invalid={problem ? true : undefined}
											aria-describedby={problem ? `${rowId}e` : undefined}
											onChange={(event) => {
												const next = sources.find(
													(s) => s.id === event.target.value,
												);
												if (next) setCondition(i, newCondition(next));
											}}
										>
											{source ? null : (
												<option value="" disabled>
													Choose a question
												</option>
											)}
											{sources.map((s) => (
												<option key={s.id} value={s.id}>
													{s.label}
												</option>
											))}
										</select>

										<label className={styles.srOnly} htmlFor={`${rowId}o`}>
											Condition {i + 1}: test
										</label>
										<select
											id={`${rowId}o`}
											className={styles.select}
											value={condition.op}
											disabled={!source}
											onChange={(event) => {
												const op = event.target.value as ConditionOp;
												const same =
													OP_INFO[op].value === OP_INFO[condition.op].value;
												setCondition(i, {
													...condition,
													op,
													value:
														same || !source
															? condition.value
															: freshValue(op, source),
												});
											}}
										>
											{(source?.ops ?? [condition.op]).map((op) => (
												<option key={op} value={op}>
													{OP_INFO[op].label}
												</option>
											))}
										</select>

										<ConditionValue
											id={`${rowId}v`}
											label={`Condition ${i + 1}: value`}
											condition={condition}
											source={source}
											invalid={Boolean(problem)}
											onChange={(value) =>
												setCondition(i, { ...condition, value })
											}
										/>

										<button
											type="button"
											className={styles.iconButton}
											onClick={() =>
												update(showIf.conditions.filter((_, j) => j !== i))
											}
										>
											<CloseIcon />
											<span className={styles.srOnly}>
												Remove condition {i + 1}
											</span>
										</button>
									</div>
									{problem ? (
										<p className={styles.fieldError} id={`${rowId}e`}>
											<AlertIcon />
											{problem.message}
										</p>
									) : null}
								</li>
							);
						})}
					</ol>

					{general ? (
						<p className={styles.fieldError}>
							<AlertIcon />
							{general.message}
						</p>
					) : null}

					{showIf.conditions.length < FORM_LIMITS.conditions &&
					sources.length > 0 ? (
						<button
							type="button"
							className={styles.textButton}
							onClick={() => {
								const last = sources[sources.length - 1];
								if (last) update([...showIf.conditions, newCondition(last)]);
							}}
						>
							+ Add a condition
						</button>
					) : null}
				</>
			) : null}
		</div>
	);
}

function ConditionValue({
	id,
	label,
	condition,
	source,
	invalid,
	onChange,
}: {
	id: string;
	label: string;
	condition: Condition;
	source: Source | undefined;
	invalid: boolean;
	onChange: (value: Condition["value"]) => void;
}) {
	const kind = OP_INFO[condition.op].value;
	if (kind === "none" || !source)
		return <span className={styles.conditionGap} />;
	const v = condition.value;

	if (kind === "option")
		return (
			<>
				<label className={styles.srOnly} htmlFor={id}>
					{label}
				</label>
				<select
					id={id}
					className={styles.select}
					value={typeof v === "string" ? v : ""}
					aria-invalid={invalid || undefined}
					onChange={(event) => onChange(event.target.value)}
				>
					{typeof v === "string" &&
					source.options.some((o) => o.id === v) ? null : (
						<option value="" disabled>
							Choose
						</option>
					)}
					{source.options.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label || "Untitled option"}
						</option>
					))}
				</select>
			</>
		);

	if (kind === "options") {
		const picked = Array.isArray(v) ? v : [];
		return (
			<fieldset className={styles.pickSet} aria-invalid={invalid || undefined}>
				<legend className={styles.srOnly}>{label}</legend>
				{source.options.map((option) => (
					<label key={option.id} className={styles.pick}>
						<input
							type="checkbox"
							checked={picked.includes(option.id)}
							onChange={(event) =>
								onChange(
									event.target.checked
										? [...picked, option.id]
										: picked.filter((p) => p !== option.id),
								)
							}
						/>
						{option.label || "Untitled option"}
					</label>
				))}
			</fieldset>
		);
	}

	return (
		<>
			<label className={styles.srOnly} htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				className={styles.input}
				type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
				inputMode={kind === "number" ? "decimal" : undefined}
				maxLength={kind === "text" ? FORM_LIMITS.conditionText : undefined}
				placeholder={kind === "text" ? "Text" : undefined}
				value={
					v === null || v === undefined || Array.isArray(v) ? "" : String(v)
				}
				aria-invalid={invalid || undefined}
				onChange={(event) => {
					const raw = event.target.value;
					if (kind === "number") {
						const n = raw === "" ? null : Number(raw);
						onChange(n === null || Number.isFinite(n) ? n : null);
					} else onChange(raw);
				}}
			/>
		</>
	);
}
