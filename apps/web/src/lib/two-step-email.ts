import "server-only";
import { randomUUID } from "node:crypto";
import { sendEmail } from "./email";
import { escapeHtml } from "./text";

/**
 * Tells someone their two-step sign-in changed, so a change that was not
 * theirs does not go unseen. Best effort: the change is already made, and an
 * email that cannot be sent does not undo it.
 */
const NOTICES = {
	turned_on: {
		subject: "Two-step sign-in is on",
		body: "Signing in to MakeMyEvent now also asks for a code from your authenticator app.",
	},
	moved: {
		subject: "Your authenticator app was changed",
		body: "Codes now come from a new authenticator app. The old one no longer works.",
	},
	turned_off: {
		subject: "Two-step sign-in is off",
		body: "Signing in to MakeMyEvent no longer asks for a code from an authenticator app.",
	},
	recovered: {
		subject: "A recovery code was used",
		body: "Your authenticator app was removed with one of your recovery codes, and your other devices were signed out.",
	},
	new_codes: {
		subject: "You have new recovery codes",
		body: "A new set of recovery codes was made. Your earlier codes no longer work.",
	},
} as const;

export type TwoStepNotice = keyof typeof NOTICES;

const IF_NOT_YOU =
	"If this wasn't you, reply to this email or write to admin@makemyevent.org straight away.";

export async function sendTwoStepNotice(
	to: string | undefined,
	notice: TwoStepNotice,
): Promise<void> {
	if (!to) return;
	const { subject, body } = NOTICES[notice];
	const e = escapeHtml;
	// Inline, in the colours of design-spec.md: email clients read no stylesheet.
	const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px 12px;background:#F7F6F2;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1B1A18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#FEFDFC;border:1px solid #DAD6CC;border-radius:18px"><tr><td style="padding:24px">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.25">${e(subject)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${e(body)}</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#686764">${e(IF_NOT_YOU)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
	const result = await sendEmail({
		to,
		subject,
		html,
		text: `${body}\n\n${IF_NOT_YOU}`,
		idempotencyKey: randomUUID(),
	});
	// Which notice and why, never whose.
	if (!result.ok)
		console.error(`two-step notice ${notice} not sent: ${result.message}`);
}
