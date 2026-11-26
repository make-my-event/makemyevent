"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ErrorLine } from "@/app/signin/error-line";
import { RecoveryCodes } from "@/app/signin/recovery-codes";
import styles from "@/app/signin/two-step.module.css";
import {
	makeNewCodes,
	type SecurityState,
	signOutOthers,
	turnOff,
} from "./actions";

export function SecurityPanel({
	isOn,
	required,
	codesLeft,
	since,
	setupHref,
}: {
	isOn: boolean;
	/** They run an event: it cannot be turned off. */
	required: boolean;
	codesLeft: number;
	since: string | null;
	setupHref: string;
}) {
	const [codes, newCodes, makingCodes] = useActionState<SecurityState>(
		makeNewCodes,
		null,
	);
	const [off, turnOffAction, turningOff] = useActionState<SecurityState>(
		turnOff,
		null,
	);
	const [others, endOthers, endingOthers] = useActionState<SecurityState>(
		signOutOthers,
		null,
	);
	// Turning off asks once more, in place.
	const [confirming, setConfirming] = useState(false);
	const confirmRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (confirming) confirmRef.current?.focus();
	}, [confirming]);

	const shown = codes && "codes" in codes ? codes.codes : null;
	const codesRef = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		if (shown) codesRef.current?.focus();
	}, [shown]);

	const notice =
		(off && "message" in off && !isOn && off.message) ||
		(others && "message" in others && others.message) ||
		null;
	const errorOf = (state: SecurityState) =>
		state && "error" in state ? state : null;

	return (
		<>
			<div className={styles.notice} role="status">
				{notice ? (
					<p className={styles.ok}>
						<svg
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<circle cx="8" cy="8" r="6.5" />
							<path d="m5.25 8.25 2 2 3.5-4" />
						</svg>
						<span>{notice}</span>
					</p>
				) : null}
			</div>

			<section className={styles.section} aria-labelledby="two-step-title">
				<h2 className={styles.h2} id="two-step-title">
					Two-step sign-in: {isOn ? "on" : "off"}
				</h2>
				<p className={styles.text}>
					{isOn
						? `Signing in asks for a code from your authenticator app${since ? `, added on ${since}` : ""}.`
						: "Sign in with a code from an app on your phone as well. Needed to run events."}
					{isOn && required ? " You run an event, so it stays on." : ""}
				</p>
				<ErrorLine
					id="off-error"
					message={errorOf(off)?.error}
					attempt={errorOf(off)?.attempt ?? 0}
				/>
				<div className={styles.row}>
					{isOn ? (
						<>
							<a className={styles.secondary} href="/account/security/move">
								Move to a new phone
							</a>
							{required ? null : confirming ? (
								<form className={styles.row} action={turnOffAction}>
									<button
										ref={confirmRef}
										type="submit"
										className={styles.danger}
										disabled={turningOff}
									>
										{turningOff ? "Turning off…" : "Yes, turn it off"}
									</button>
									<button
										type="button"
										className={styles.secondary}
										onClick={() => setConfirming(false)}
									>
										Keep it on
									</button>
								</form>
							) : (
								<button
									type="button"
									className={styles.danger}
									onClick={() => setConfirming(true)}
								>
									Turn off
								</button>
							)}
						</>
					) : (
						<a className={styles.primary} href={setupHref}>
							Set up
						</a>
					)}
				</div>
			</section>

			{isOn ? (
				<section className={styles.section} aria-labelledby="codes-title">
					<h2
						className={styles.h2}
						id="codes-title"
						ref={codesRef}
						tabIndex={-1}
					>
						{shown ? "Save your new recovery codes" : "Recovery codes"}
					</h2>
					{shown ? (
						<>
							<p className={styles.text}>
								Each works once, and they are shown only now. Your earlier codes
								no longer work.
							</p>
							<RecoveryCodes codes={shown} />
						</>
					) : (
						<>
							<p className={styles.text}>
								{codesLeft === 0
									? "You have none left. Make new ones, so you can get in without your phone."
									: `${codesLeft} of 10 left. Each gets you in once without your phone.`}
							</p>
							<ErrorLine
								id="codes-error"
								message={errorOf(codes)?.error}
								attempt={errorOf(codes)?.attempt ?? 0}
							/>
							<form action={newCodes}>
								<button
									type="submit"
									className={styles.secondary}
									disabled={makingCodes}
								>
									{makingCodes ? "Making codes…" : "Make new codes"}
								</button>
							</form>
						</>
					)}
				</section>
			) : null}

			<section className={styles.section} aria-labelledby="devices-title">
				<h2 className={styles.h2} id="devices-title">
					Other devices
				</h2>
				<p className={styles.text}>
					Sign out everywhere except here, such as a lost phone or a shared
					computer.
				</p>
				<ErrorLine
					id="others-error"
					message={errorOf(others)?.error}
					attempt={errorOf(others)?.attempt ?? 0}
				/>
				<form action={endOthers}>
					<button
						type="submit"
						className={styles.secondary}
						disabled={endingOthers}
					>
						{endingOthers ? "Signing out…" : "Sign out other devices"}
					</button>
				</form>
			</section>
		</>
	);
}
