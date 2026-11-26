import "server-only";
import { escapeHtml } from "@/lib/text";

/**
 * The email that tells someone they were added to an event's team: who added
 * them, to what, as what, and the one thing to do, which is to sign in with
 * this address. No password, no account to make first.
 *
 * Email clients ignore stylesheets, so it is styled inline, in the colours
 * of design-spec.md written out (an email can't read our tokens).
 */

export type TeamInviteEmail = {
	inviterName: string;
	eventTitle: string;
	roleLabel: string;
	roleHint: string;
	email: string;
	/** Where it opens: the event's dashboard, through sign-in. */
	url: string;
};

const INK = "#1B1A18";
const PAPER = "#F7F6F2";
const SURFACE = "#FEFDFC";
const STAMP = "#1F7A4D";
const PERFORATION = "#DAD6CC";
/** muted: 65% ink over paper, worked out, since email has no color-mix(). */
const MUTED = "#686764";

export function teamInviteSubject(p: TeamInviteEmail): string {
	return `${p.inviterName} added you to ${p.eventTitle}`;
}

export function teamInviteText(p: TeamInviteEmail): string {
	return [
		`${p.inviterName} added you to the team for ${p.eventTitle}, as ${p.roleLabel}.`,
		p.roleHint,
		"",
		`Open it here, signing in with ${p.email}:`,
		p.url,
		"",
		"Not expecting this? You can ignore it: nothing happens until you sign in.",
	].join("\n");
}

export function teamInviteHtml(p: TeamInviteEmail): string {
	const e = escapeHtml;
	return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px 12px;background:${PAPER};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:${SURFACE};border:1px solid ${PERFORATION};border-radius:18px">
<tr><td style="padding:24px 24px 8px">
<p style="margin:0 0 4px;color:${STAMP};font-size:13px;font-weight:600">${e(p.roleLabel)}</p>
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.25">${e(p.eventTitle)}</h1>
<p style="margin:0;font-size:15px;line-height:1.5">${e(p.inviterName)} added you to the team. ${e(p.roleHint)}</p>
</td></tr>
<tr><td style="padding:16px 24px 8px">
<a href="${e(p.url)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:${STAMP};color:${PAPER};font-size:15px;font-weight:600;text-decoration:none">Open the event</a>
</td></tr>
<tr><td style="padding:8px 24px 24px">
<p style="margin:0 0 4px;color:${MUTED};font-size:13px">Sign in with ${e(p.email)}. No password needed.</p>
<p style="margin:0;color:${MUTED};font-size:13px">Not expecting this? Ignore it: nothing happens until you sign in.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
