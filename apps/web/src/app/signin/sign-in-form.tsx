"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
	requestMagicLink,
	type SignInState,
	startGoogleSignIn,
} from "./actions";
import styles from "./signin.module.css";

export type UrlError = "link_invalid" | "cancelled" | "failed";

const URL_ERROR_TEXT: Record<UrlError, string> = {
	link_invalid:
		"That sign-in link has expired or was already used. Enter your email to get a new one.",
	cancelled: "Google sign-in was cancelled. Try again, or use an email link.",
	failed: "We couldn't sign you in. Try again.",
};

const RESEND_WAIT_SECONDS = 60;
const IDLE: SignInState = { status: "idle" };

export function SignInForm({
	next,
	urlError,
}: {
	next: string;
	urlError: UrlError | null;
}) {
	const [state, sendLink, sending] = useActionState(requestMagicLink, IDLE);
	const [googleState, signInWithGoogle, openingGoogle] = useActionState(
		startGoogleSignIn,
		IDLE,
	);

	// A link problem reported in the address bar, until the person acts again.
	const [urlErrorText, setUrlErrorText] = useState(
		urlError ? URL_ERROR_TEXT[urlError] : null,
	);
	// Set when "Use a different email" is pressed, cleared by the next send.
	const [dismissedSend, setDismissedSend] = useState<number | null>(null);
	const [wait, setWait] = useState(0);

	const emailRef = useRef<HTMLInputElement>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);

	const busy = sending || openingGoogle;
	const error = state.error ?? googleState.error ?? urlErrorText;
	const showSent = state.status === "sent" && state.sentAt !== dismissedSend;

	// Supabase reports some link problems after the "#" in the address, which
	// the server never sees.
	useEffect(() => {
		const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
		if (!hash.get("error")) return;
		setUrlErrorText(
			URL_ERROR_TEXT[
				hash.get("error_code") === "otp_expired" ? "link_invalid" : "failed"
			],
		);
		window.history.replaceState(
			null,
			"",
			window.location.pathname + window.location.search,
		);
	}, []);

	// Clear a stale address-bar error once the person tries something new.
	useEffect(() => {
		if (state.error || state.status === "sent" || googleState.error)
			setUrlErrorText(null);
	}, [state.error, state.status, googleState.error]);

	// Restart the countdown each time a link goes out.
	useEffect(() => {
		if (state.status === "sent" && state.sentAt) setWait(RESEND_WAIT_SECONDS);
	}, [state.status, state.sentAt]);

	useEffect(() => {
		if (wait <= 0) return;
		const timer = window.setTimeout(() => setWait((s) => s - 1), 1000);
		return () => window.clearTimeout(timer);
	}, [wait]);

	// Move focus to the new heading so screen readers announce the change.
	useEffect(() => {
		if (showSent) headingRef.current?.focus();
	}, [showSent]);

	// Put the cursor back where the problem is.
	useEffect(() => {
		if (state.error) emailRef.current?.focus();
	}, [state.error]);

	const errorBox = error ? (
		<p className={styles.error} role="alert" data-shown="true">
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				aria-hidden="true"
			>
				<circle cx="8" cy="8" r="6.5" />
				<path d="M8 4.75v3.75M8 11.1h.01" />
			</svg>
			<span>{error}</span>
		</p>
	) : null;

	if (showSent) {
		return (
			<>
				<h1 className={styles.title} ref={headingRef} tabIndex={-1}>
					Check your email
				</h1>
				<p className={styles.lede}>
					We sent a sign-in link to{" "}
					<strong className={styles.strong}>{state.email}</strong>. It works
					once and expires in an hour.
				</p>

				<div className={styles.actions}>
					{errorBox}
					<form action={sendLink}>
						<input type="hidden" name="email" value={state.email ?? ""} />
						<input type="hidden" name="next" value={next} />
						<button
							type="submit"
							className={`${styles.btn} ${styles.btnSecondary}`}
							disabled={wait > 0 || sending}
						>
							{sending
								? "Sending link…"
								: wait > 0
									? `Send again in ${wait}s`
									: "Send the link again"}
						</button>
					</form>
					<button
						type="button"
						className={`${styles.btn} ${styles.btnQuiet}`}
						onClick={() => {
							setDismissedSend(state.sentAt ?? null);
							setWait(0);
							window.setTimeout(() => emailRef.current?.focus(), 0);
						}}
					>
						Use a different email
					</button>
				</div>

				<p className={styles.foot}>Nothing there? Check your spam folder.</p>
			</>
		);
	}

	return (
		<>
			<h1 className={styles.title}>Sign in</h1>
			<p className={styles.lede}>Manage your events, tickets and check-ins.</p>

			<form className={styles.form} action={sendLink} noValidate>
				{errorBox}
				<input type="hidden" name="next" value={next} />

				<div className={styles.field}>
					<label className={styles.label} htmlFor="email">
						Email
					</label>
					<input
						ref={emailRef}
						className={styles.input}
						id="email"
						name="email"
						type="email"
						inputMode="email"
						autoComplete="email"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						placeholder="you@example.com"
						defaultValue={state.email ?? ""}
						aria-invalid={Boolean(state.error)}
						maxLength={254}
						required
						disabled={busy}
					/>
				</div>

				<button
					type="submit"
					className={`${styles.btn} ${styles.btnPrimary}`}
					disabled={busy}
				>
					{sending ? "Sending link…" : "Email me a sign-in link"}
				</button>
			</form>

			<div className={styles.divider}>or</div>

			<form className={styles.actions} action={signInWithGoogle}>
				<input type="hidden" name="next" value={next} />
				<button
					type="submit"
					className={`${styles.btn} ${styles.btnSecondary}`}
					disabled={busy}
				>
					{/* Google's own mark, in Google's colours, as its sign-in branding rules require. */}
					<svg className={styles.google} viewBox="0 0 18 18" aria-hidden="true">
						<path
							fill="#4285F4"
							d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
						/>
						<path
							fill="#34A853"
							d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
						/>
						<path
							fill="#FBBC05"
							d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33Z"
						/>
						<path
							fill="#EA4335"
							d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
						/>
					</svg>
					{openingGoogle ? "Opening Google…" : "Continue with Google"}
				</button>
			</form>

			<p className={styles.foot}>
				No password needed. New here? Signing in creates your account.
			</p>
			<p className={`${styles.foot} ${styles.fine}`}>
				By continuing you agree to the{" "}
				<a className={styles.link} href="/terms">
					terms of service
				</a>{" "}
				and{" "}
				<a className={styles.link} href="/privacy">
					privacy policy
				</a>
				.
			</p>
		</>
	);
}
