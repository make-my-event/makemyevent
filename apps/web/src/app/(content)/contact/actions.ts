"use server";

import { createHash } from "node:crypto";
import { CONTACT_TOPIC_LABELS, contactInput } from "@makemyevent/core";
import { BUSINESS } from "@/lib/business";
import { sendEmail } from "@/lib/email";
import { limited } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/text";
import { verifyTurnstile } from "@/lib/turnstile-verify";

export type ContactField = "name" | "email" | "topic" | "message";

export type ContactState = {
	status: "idle" | "sent";
	/** Said above the form: what went wrong and what to do. */
	error?: string;
	/** Said beside the field it is about. */
	fieldErrors?: Partial<Record<ContactField, string>>;
	/** What was typed, so a refused message is not lost. */
	values?: Partial<Record<ContactField, string>>;
	/** Changes on every answer, so the bot check fetches a new token. */
	at?: number;
};

const NOT_CHECKED =
	"We couldn't check that you're not a bot. Try again, or email us instead.";

const UNAVAILABLE = `The form can't send just now. Email ${BUSINESS.email} instead.`;

function text(form: FormData, key: ContactField): string {
	const value = form.get(key);
	return typeof value === "string" ? value : "";
}

/**
 * Sends a message from the contact form to our inbox, with the sender as the
 * reply address.
 *
 * Public, like any form anyone can open: the input is validated here, the bot
 * check is confirmed with Cloudflare on this server, and sending is limited
 * per sender, per network and for the whole site. The same message sent
 * twice is delivered once.
 */
export async function sendContactMessage(
	_previous: ContactState,
	form: FormData,
): Promise<ContactState> {
	const values = {
		name: text(form, "name"),
		email: text(form, "email"),
		topic: text(form, "topic"),
		message: text(form, "message"),
	};
	const at = Date.now();

	const parsed = contactInput.safeParse(values);
	if (!parsed.success) {
		const fieldErrors: ContactState["fieldErrors"] = {};
		for (const issue of parsed.error.issues) {
			const field = issue.path[0] as ContactField;
			fieldErrors[field] ??= issue.message;
		}
		return { status: "idle", fieldErrors, values, at };
	}
	const input = parsed.data;

	const verdict = await verifyTurnstile(form.get("captcha"), "contact");
	if (verdict === "failed")
		return { status: "idle", error: NOT_CHECKED, values, at };
	if (verdict === "unavailable")
		return { status: "idle", error: UNAVAILABLE, values, at };

	const slow = await limited("contact.send", { email: input.email });
	if (slow) return { status: "idle", error: slow.message, values, at };

	const topic = CONTACT_TOPIC_LABELS[input.topic];
	const digest = createHash("sha256")
		.update(`${input.email}\n${input.topic}\n${input.message}`)
		.digest("hex");

	const sent = await sendEmail({
		to: BUSINESS.email,
		replyTo: input.email,
		subject: `Contact form: ${topic} — ${input.name.replace(/\s+/g, " ")}`,
		text: `From: ${input.name} <${input.email}>\nAbout: ${topic}\n\n${input.message}\n`,
		html: `<p><strong>From:</strong> ${escapeHtml(input.name)} &lt;${escapeHtml(input.email)}&gt;<br><strong>About:</strong> ${escapeHtml(topic)}</p><p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
		idempotencyKey: `contact:${digest}`,
	});
	if (!sent.ok) {
		console.error(
			JSON.stringify({ event: "contact.send_failed", detail: sent.message }),
		);
		return {
			status: "idle",
			error: sent.retry
				? "Your message didn't send. Try again in a moment."
				: UNAVAILABLE,
			values,
			at,
		};
	}

	return { status: "sent", at };
}
