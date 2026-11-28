import "server-only";
import { escapeHtml } from "@/lib/text";

/**
 * The email that carries a guest's pass: who it's for, the event, when and
 * where, the ticket code, a button to their ticket page (the pass in its
 * design, from a signed link), and a small QR as a backup for a door with no
 * signal (an inline image, so it works offline).
 *
 * Email clients ignore stylesheets, so it is styled inline, in the colours
 * of design-spec.md written out (an email can't read our tokens): ink on
 * paper, stamp for the ticket line, perforation for the tear line.
 */

export type PassEmail = {
	guestName: string;
	eventTitle: string;
	when: string | null;
	where: string | null;
	ticketName: string;
	ticketCode: string;
	/** The QR attachment's content id. */
	qrCid: string;
	/** Their ticket page, from a signed view link. */
	ticketUrl: string;
	/** Their tickets in their account (they sign in with this email). */
	ticketsUrl: string;
	/** The logo attachment's content id, or null when it couldn't be read. */
	logoCid: string | null;
};

const INK = "#1B1A18";
const PAPER = "#F7F6F2";
const SURFACE = "#FEFDFC";
const STAMP = "#1F7A4D";
const PERFORATION = "#DAD6CC";
/** muted: 65% ink over paper, worked out, since email has no color-mix(). */
const MUTED = "#686764";

/** "Your ticket for Summit 2026, Sat, Nov 28"; without the date when unset. */
export function passSubject(eventTitle: string, day: string | null): string {
	return day
		? `Your ticket for ${eventTitle}, ${day}`
		: `Your ticket for ${eventTitle}`;
}

export function passText(p: PassEmail): string {
	return [
		`Hi ${p.guestName},`,
		"",
		`You're on the list for ${p.eventTitle}.`,
		p.when ? `When: ${p.when}` : null,
		p.where ? `Where: ${p.where}` : null,
		`Ticket: ${p.ticketName}`,
		`Ticket code: ${p.ticketCode}`,
		"",
		`View your ticket: ${p.ticketUrl}`,
		`See all your tickets (sign in with this email): ${p.ticketsUrl}`,
		"",
		"Show the code on your ticket at the door. If it won't scan, read out the ticket code.",
		"This link is your ticket. Don't share it.",
	]
		.filter((line) => line !== null)
		.join("\n");
}

export function passHtml(p: PassEmail): string {
	const e = escapeHtml;
	const row = (label: string, value: string, mono = false) =>
		`<tr><td style="padding:3px 0;color:${MUTED};font-size:13px;width:64px;vertical-align:top">${e(label)}</td><td style="padding:3px 0;color:${INK};font-size:14px${mono ? ";font-family:'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.5px" : ""}">${e(value)}</td></tr>`;
	const first = p.guestName.trim().split(/\s+/)[0] || p.guestName;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:20px 12px;background:${PAPER};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:400px;background:${SURFACE};border:1px solid ${PERFORATION};border-radius:14px">
<tr><td style="padding:18px 20px 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${p.logoCid ? `<td style="padding-right:8px;vertical-align:middle"><img src="cid:${e(p.logoCid)}" width="26" height="29" alt="" style="display:block;width:26px;height:29px;border:0"></td>` : ""}
<td style="vertical-align:middle;font-size:16px;font-weight:700;color:${INK}">MakeMyEvent</td>
</tr></table>
</td></tr>
<tr><td style="padding:18px 20px 4px">
<p style="margin:0 0 4px;color:${STAMP};font-size:14px;font-weight:600">Your ticket is confirmed</p>
<h1 style="margin:0 0 10px;font-size:24px;line-height:1.2">${e(p.eventTitle)}</h1>
<p style="margin:0;font-size:14px;line-height:1.5">Hi ${e(first)}, your place is confirmed. Open your ticket for your pass and the code to show at the door.</p>
</td></tr>
<tr><td style="padding:12px 20px 4px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px dashed ${PERFORATION};padding-top:8px">
${p.when ? row("When", p.when) : ""}${p.where ? row("Where", p.where) : ""}${row("Ticket", p.ticketName)}${row("Code", p.ticketCode, true)}
</table></td></tr>
<tr><td style="padding:14px 20px 4px">
<a href="${e(p.ticketUrl)}" style="display:inline-block;padding:11px 18px;background:${INK};color:${PAPER};border-radius:10px;font-size:14px;font-weight:600;text-decoration:none">View your ticket</a>
</td></tr>
<tr><td style="padding:10px 20px 0">
<a href="${e(p.ticketsUrl)}" style="color:${STAMP};font-size:14px;font-weight:600">See all your tickets</a>
<span style="color:${MUTED};font-size:12px"> (sign in with this email)</span>
</td></tr>
<tr><td style="padding:10px 20px 0">
<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5">Button not working? Open this link: <a href="${e(p.ticketUrl)}" style="color:${STAMP};word-break:break-all">${e(p.ticketUrl)}</a></p>
</td></tr>
<tr><td style="padding:16px 20px 20px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px dashed ${PERFORATION}"><tr>
<td width="168" style="padding-top:14px;vertical-align:top"><img src="cid:${e(p.qrCid)}" width="160" height="160" alt="QR code for ${e(p.guestName)}'s ticket" style="display:block;width:160px;height:160px;border:0"></td>
<td style="padding:14px 0 0 12px;vertical-align:top;color:${MUTED};font-size:12px;line-height:1.5">No signal at the door? Show this code. This email is your ticket: don't forward it.</td>
</tr></table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
