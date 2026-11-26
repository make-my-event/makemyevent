"use client";

import { useActionState, useEffect, useRef } from "react";
import { useAutoSubmit } from "./auto-submit";
import { ErrorLine } from "./error-line";
import styles from "./signin.module.css";
import twoStep from "./two-step.module.css";
import {
	type CodeState,
	enterCode,
	enterRecoveryCode,
} from "./two-step-actions";

const KINDS = {
	app: {
		action: enterCode,
		label: "6-digit code",
		inputMode: "numeric",
		// Lets a phone or password manager offer the code, and paste works:
		// nothing has to be remembered or copied out by hand (WCAG 3.3.8).
		autoComplete: "one-time-code",
		maxLength: 12,
		submit: "Continue",
		pending: "Checking…",
	},
	recovery: {
		action: enterRecoveryCode,
		label: "Recovery code",
		inputMode: "text",
		autoComplete: "off",
		maxLength: 40,
		submit: "Use this code",
		pending: "Checking…",
	},
} as const;

/** One code, from the app or from the recovery list. */
export function CodeForm({
	kind,
	next,
}: {
	kind: keyof typeof KINDS;
	next: string;
}) {
	const k = KINDS[kind];
	const [state, action, pending] = useActionState<CodeState, FormData>(
		k.action,
		null,
	);
	const inputRef = useRef<HTMLInputElement>(null);
	const autoSubmit = useAutoSubmit(pending);

	// The one thing to do here. Not on touch, where it would raise the
	// keyboard over the words before they are read.
	useEffect(() => {
		if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
	}, []);

	useEffect(() => {
		// After a wrong code, the next one replaces it as it is typed.
		if (state) inputRef.current?.select();
	}, [state]);

	return (
		<form className={styles.form} action={action} noValidate>
			<input type="hidden" name="next" value={next} />
			<div className={styles.field}>
				<label className={styles.label} htmlFor="code">
					{k.label}
				</label>
				<input
					ref={inputRef}
					className={`${styles.input} ${twoStep.code}`}
					id="code"
					name="code"
					type="text"
					inputMode={k.inputMode}
					autoComplete={k.autoComplete}
					autoCapitalize={kind === "recovery" ? "characters" : "none"}
					autoCorrect="off"
					spellCheck={false}
					maxLength={k.maxLength}
					aria-invalid={Boolean(state)}
					aria-describedby="code-error"
					onChange={kind === "app" ? autoSubmit : undefined}
					required
				/>
				<ErrorLine
					id="code-error"
					message={state?.error}
					attempt={state?.attempt ?? 0}
				/>
			</div>
			<button
				type="submit"
				className={`${styles.btn} ${styles.btnPrimary}`}
				disabled={pending}
				aria-busy={pending || undefined}
			>
				{pending ? k.pending : k.submit}
			</button>
		</form>
	);
}
