"use client";

import {
	CONTACT_MESSAGE_MAX,
	CONTACT_NAME_MAX,
	CONTACT_TOPIC_LABELS,
	CONTACT_TOPICS,
} from "@makemyevent/core";
import { useActionState, useEffect, useRef } from "react";
import { CheckedForm } from "@/components/checked-form";
import { ErrorIcon } from "@/components/error-icon";
import { BUSINESS } from "@/lib/business";
import { type ContactState, sendContactMessage } from "./actions";
import styles from "./contact.module.css";

const IDLE: ContactState = { status: "idle" };

const WITHOUT_SCRIPT =
	"The contact form needs JavaScript. Turn it on, or email us instead.";
const CHECK_FAILED =
	"We couldn't check that you're not a bot. A content blocker or your network may be stopping it. Try again, or email us instead.";

export function ContactForm({ siteKey }: { siteKey: string | null }) {
	const [state, send, sending] = useActionState(sendContactMessage, IDLE);
	const formRef = useRef<HTMLDivElement>(null);
	const doneRef = useRef<HTMLHeadingElement>(null);

	// Focus the first field with a problem, or the confirmation.
	useEffect(() => {
		if (state.status === "sent") {
			doneRef.current?.focus();
			return;
		}
		const first = state.fieldErrors
			? (["name", "email", "topic", "message"] as const).find(
					(f) => state.fieldErrors?.[f],
				)
			: undefined;
		if (first)
			formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
	}, [state]);

	if (state.status === "sent") {
		return (
			<div className={styles.sent}>
				<h2 ref={doneRef} tabIndex={-1} className={styles.sentTitle}>
					Message sent
				</h2>
				<p>
					Thanks for writing. We reply to the email address you gave within{" "}
					{BUSINESS.responseHours} hours.
				</p>
			</div>
		);
	}

	const values = state.values ?? {};
	const errors = state.fieldErrors ?? {};
	const describedBy = (field: keyof typeof errors) =>
		errors[field] ? `contact-${field}-error` : undefined;
	const fieldError = (field: keyof typeof errors) =>
		errors[field] ? (
			<p id={`contact-${field}-error`} className={styles.fieldError}>
				<ErrorIcon />
				<span>{errors[field]}</span>
			</p>
		) : null;

	return (
		<div ref={formRef}>
			<CheckedForm
				className={styles.form}
				siteKey={siteKey}
				check="contact"
				withoutScript={WITHOUT_SCRIPT}
				failed={CHECK_FAILED}
				action={send}
				spent={state.at}
				before={
					<>
						{state.error ? (
							<p className={styles.error} role="alert">
								<ErrorIcon />
								<span>{state.error}</span>
							</p>
						) : null}

						<div className={styles.row}>
							<div className={styles.field}>
								<label className={styles.label} htmlFor="contact-name">
									Name
								</label>
								<input
									id="contact-name"
									className={styles.input}
									name="name"
									autoComplete="name"
									maxLength={CONTACT_NAME_MAX}
									defaultValue={values.name}
									key={`name-${state.at}`}
									aria-invalid={errors.name ? true : undefined}
									aria-describedby={describedBy("name")}
									required
								/>
								{fieldError("name")}
							</div>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="contact-email">
									Email
								</label>
								<input
									id="contact-email"
									className={styles.input}
									name="email"
									type="email"
									inputMode="email"
									autoComplete="email"
									spellCheck={false}
									defaultValue={values.email}
									key={`email-${state.at}`}
									aria-invalid={errors.email ? true : undefined}
									aria-describedby={describedBy("email")}
									required
								/>
								{fieldError("email")}
							</div>
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="contact-topic">
								What it&rsquo;s about
							</label>
							<select
								id="contact-topic"
								className={`${styles.input} ${styles.select}`}
								name="topic"
								defaultValue={values.topic ?? "general"}
								key={`topic-${state.at}`}
								aria-invalid={errors.topic ? true : undefined}
								aria-describedby={describedBy("topic")}
							>
								{CONTACT_TOPICS.map((topic) => (
									<option key={topic} value={topic}>
										{CONTACT_TOPIC_LABELS[topic]}
									</option>
								))}
							</select>
							{fieldError("topic")}
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="contact-message">
								Message
							</label>
							<textarea
								id="contact-message"
								className={`${styles.input} ${styles.textarea}`}
								name="message"
								rows={6}
								maxLength={CONTACT_MESSAGE_MAX}
								defaultValue={values.message}
								key={`message-${state.at}`}
								aria-invalid={errors.message ? true : undefined}
								aria-describedby={describedBy("message")}
								required
							/>
							{fieldError("message")}
							<p className={styles.hint}>
								For a ticket or refund, include the email you bought with and
								the order reference.
							</p>
						</div>
					</>
				}
			>
				{(waiting) => (
					<button
						type="submit"
						className={styles.btn}
						disabled={sending || waiting}
					>
						{sending || waiting ? "Sending…" : "Send message"}
					</button>
				)}
			</CheckedForm>
			<p className={styles.hint}>
				Or write to <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
			</p>
		</div>
	);
}
