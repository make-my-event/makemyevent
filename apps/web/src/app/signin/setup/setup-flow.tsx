"use client";

import { useActionState, useEffect, useRef } from "react";
import { useCopy } from "@/components/ui/use-copy";
import { useAutoSubmit } from "../auto-submit";
import { ErrorLine } from "../error-line";
import { RecoveryCodes } from "../recovery-codes";
import styles from "../signin.module.css";
import twoStep from "../two-step.module.css";
import { finishSetup, type SetupState, startSetup } from "../two-step-actions";

/** One form for both steps: which action runs is the step it is on. */
function advance(previous: SetupState, form: FormData): Promise<SetupState> {
	return previous.at === "scan" && form.get("step") === "finish"
		? finishSetup(previous, form)
		: startSetup(previous, form);
}

export function SetupFlow({
	next,
	email,
	isOn,
	move = false,
	recovered = false,
}: {
	next: string;
	email: string;
	/** They have an authenticator and have used it in this session. */
	isOn: boolean;
	/** They came to change it. */
	move?: boolean;
	/** They came from a recovery code. */
	recovered?: boolean;
}) {
	const [state, action, pending] = useActionState<SetupState, FormData>(
		advance,
		{ at: "start" },
	);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const codeRef = useRef<HTMLInputElement>(null);
	const { copied, copy } = useCopy();
	const autoSubmit = useAutoSubmit(pending);

	// A new screen: focus its heading, so it is announced and read from the
	// top. Not on the first one, which the page load already announces.
	const screen = state.at;
	const first = useRef(screen);
	useEffect(() => {
		if (screen === first.current) return;
		first.current = screen;
		headingRef.current?.focus();
	}, [screen]);

	const attempt = state.at === "scan" ? (state.attempt ?? 0) : 0;
	useEffect(() => {
		// After a wrong code, the next one replaces it as it is typed.
		if (attempt > 0) codeRef.current?.select();
	}, [attempt]);

	// A plain link: a full load, so nothing the router kept from before the
	// second step is shown.
	const onward = (label: string) => (
		<a className={`${styles.btn} ${styles.btnPrimary}`} href={next}>
			{label}
		</a>
	);

	if (state.at === "codes")
		return (
			<>
				<h1 className={styles.title} ref={headingRef} tabIndex={-1}>
					Save your recovery codes
				</h1>
				<p className={styles.lede}>
					Two-step sign-in is on. If you lose your phone, one of these codes
					gets you back in. Each works once, and they are shown only now.
				</p>
				<div className={styles.actions}>
					<RecoveryCodes codes={state.codes} />
					{onward("I’ve saved them")}
				</div>
			</>
		);

	if (state.at === "done")
		return (
			<>
				<h1 className={styles.title} ref={headingRef} tabIndex={-1}>
					{move ? "Your new app is ready" : "Two-step sign-in is on"}
				</h1>
				<p className={styles.lede}>
					{state.note ??
						"Codes from the old app no longer work. Your recovery codes are the same as before."}
				</p>
				{onward("Continue")}
			</>
		);

	if (state.at === "scan")
		return (
			<>
				<h1 className={styles.title} ref={headingRef} tabIndex={-1}>
					Add makemyevent to your app
				</h1>
				<p className={styles.lede}>
					In your authenticator app, add a new account.
				</p>
				<ol className={twoStep.steps}>
					<li className={twoStep.step}>
						<h2 className={twoStep.stepTitle}>Scan this QR code</h2>
						{/* biome-ignore lint/performance/noImgElement: a data address made for this one view; there is nothing to optimise */}
						<img
							className={twoStep.qr}
							src={state.qr}
							width={200}
							height={200}
							alt="QR code for your authenticator app. The key below does the same."
						/>
						{/* On the phone that holds the app there is nothing to scan
						    with: this hands it over instead. */}
						<a
							className={`${styles.btn} ${styles.btnSecondary} ${twoStep.onPhone}`}
							href={
								state.uri.startsWith("otpauth://totp/") ? state.uri : undefined
							}
						>
							Open in an authenticator app
						</a>
						<p className={twoStep.hint} id="key-label">
							Can’t scan it? Enter this key in the app instead, as a time-based
							code for {email}.
						</p>
						<code className={twoStep.key} aria-describedby="key-label">
							{(state.secret.match(/.{1,4}/g) ?? []).join(" ")}
						</code>
						<button
							type="button"
							className={`${styles.btn} ${styles.btnSecondary}`}
							onClick={() => void copy(state.secret)}
						>
							<span aria-live="polite">{copied ? "Copied" : "Copy key"}</span>
						</button>
					</li>
					<li className={twoStep.step}>
						<h2 className={twoStep.stepTitle}>Enter the code it shows</h2>
						<form className={styles.form} action={action} noValidate>
							<input type="hidden" name="next" value={next} />
							<input type="hidden" name="step" value="finish" />
							<div className={styles.field}>
								<label className={styles.label} htmlFor="code">
									6-digit code
								</label>
								<input
									ref={codeRef}
									className={`${styles.input} ${twoStep.code}`}
									id="code"
									name="code"
									type="text"
									inputMode="numeric"
									autoComplete="one-time-code"
									autoCorrect="off"
									spellCheck={false}
									maxLength={12}
									aria-invalid={Boolean(state.error)}
									aria-describedby="code-error"
									onChange={autoSubmit}
									required
								/>
								<ErrorLine
									id="code-error"
									message={state.error}
									attempt={attempt}
								/>
							</div>
							<button
								type="submit"
								className={`${styles.btn} ${styles.btnPrimary}`}
								disabled={pending}
								aria-busy={pending || undefined}
							>
								{pending ? "Checking…" : move ? "Use this app" : "Turn on"}
							</button>
						</form>
					</li>
				</ol>
			</>
		);

	if (isOn && !move)
		return (
			<>
				<h1 className={styles.title}>Two-step sign-in is on</h1>
				<p className={styles.lede}>
					Signing in asks for a code from your authenticator app.
				</p>
				{onward("Continue")}
			</>
		);

	return (
		<>
			<h1 className={styles.title} ref={headingRef} tabIndex={-1}>
				{move
					? "Move to a new phone"
					: recovered
						? "Set up a new authenticator"
						: "Protect your events"}
			</h1>
			<p className={styles.lede}>
				{move
					? "Set up the app on your new phone. The old one stops working once you finish."
					: recovered
						? "Your old authenticator app was removed. Set one up again, and you’ll get new recovery codes."
						: "People who run events also sign in with a code from an app on their phone, so a stolen email account can’t reach your guests. It takes about a minute."}
			</p>
			<form className={styles.actions} action={action}>
				<input type="hidden" name="next" value={next} />
				<p className={twoStep.hint}>
					You need an authenticator app, such as Google Authenticator, Microsoft
					Authenticator, 1Password or Apple Passwords.
				</p>
				<ErrorLine id="start-error" message={state.error} />
				<button
					type="submit"
					className={`${styles.btn} ${styles.btnPrimary}`}
					disabled={pending}
					aria-busy={pending || undefined}
				>
					{pending ? "Starting…" : "Start"}
				</button>
			</form>
		</>
	);
}
