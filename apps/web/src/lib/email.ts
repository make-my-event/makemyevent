import "server-only";

/**
 * Sending email through Resend's HTTP API: one request per message, no
 * package. Configured by RESEND_API_KEY and EMAIL_FROM in the app's
 * environment; without them, sending says so instead of failing.
 */

export type Attachment = {
	filename: string;
	/** Base64. */
	content: string;
	/** For an image shown inside the email: <img src="cid:{contentId}">. */
	contentId?: string;
};

export type Email = {
	to: string;
	subject: string;
	html: string;
	text: string;
	attachments?: Attachment[];
	/** The same key twice sends once: a retried request never doubles. */
	idempotencyKey: string;
};

export type SendResult =
	| { ok: true }
	| { ok: false; message: string; retry: boolean };

export function emailConfigured(): boolean {
	return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export const EMAIL_NOT_SET_UP =
	"Email isn't set up yet: add RESEND_API_KEY and EMAIL_FROM to apps/web/.env.local.";

export async function sendEmail(email: Email): Promise<SendResult> {
	const key = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!key || !from)
		return { ok: false, message: EMAIL_NOT_SET_UP, retry: false };
	let response: Response;
	try {
		response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
				"Idempotency-Key": email.idempotencyKey,
			},
			body: JSON.stringify({
				from,
				to: [email.to],
				subject: email.subject,
				html: email.html,
				text: email.text,
				attachments: email.attachments?.map((a) => ({
					filename: a.filename,
					content: a.content,
					...(a.contentId ? { content_id: a.contentId } : {}),
				})),
			}),
			signal: AbortSignal.timeout(10_000),
		});
	} catch {
		return {
			ok: false,
			message: "The email service didn't answer. Try again.",
			retry: true,
		};
	}
	if (response.ok) return { ok: true };
	// Their message, not their key: Resend's errors name the problem.
	let detail = "";
	try {
		const body = (await response.json()) as { message?: unknown };
		if (typeof body.message === "string") detail = body.message.slice(0, 200);
	} catch {
		// No body worth reading.
	}
	return {
		ok: false,
		message: detail
			? `The email service refused it: ${detail}`
			: "The email service refused it.",
		retry: response.status === 429 || response.status >= 500,
	};
}
