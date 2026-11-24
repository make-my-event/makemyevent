import "server-only";
import { escapeHtml } from "@/lib/text";

/**
 * The email that carries a guest's pass: who it's for, the event, when and
 * where, the QR to show at the door (an inline image, so it works with no
 * signal), and the ticket code to read out if the QR won't scan.
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
};

const INK = "#1B1A18";
const PAPER = "#F7F6F2";
const SURFACE = "#FEFDFC";
const STAMP = "#1F7A4D";
const PERFORATION = "#DAD6CC";
/** muted: 65% ink over paper, worked out, since email has no color-mix(). */
const MUTED = "#686764";

export function passSubject(eventTitle: string): string {
	return `Your pass for ${eventTitle}`;
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
		"Show the QR code in this email at the door. If it won't scan, read out the ticket code.",
	]
		.filter((line) => line !== null)
		.join("\n");
}

export function passHtml(p: PassEmail): string {
	const e = escapeHtml;
	const row = (label: string, value: string) =>
		`<tr><td style="padding:4px 0;color:${MUTED};font-size:13px;width:84px;vertical-align:top">${e(label)}</td><td style="padding:4px 0;color:${INK};font-size:15px">${e(value)}</td></tr>`;
	return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px 12px;background:${PAPER};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:${SURFACE};border:1px solid ${PERFORATION};border-radius:18px">
<tr><td style="padding:24px 24px 8px">
<p style="margin:0 0 4px;color:${STAMP};font-size:13px;font-weight:600">${e(p.ticketName)}</p>
<h1 style="margin:0 0 4px;font-size:22px;line-height:1.25">${e(p.eventTitle)}</h1>
<p style="margin:0;color:${MUTED};font-size:14px">For ${e(p.guestName)}</p>
</td></tr>
<tr><td style="padding:8px 24px 16px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${p.when ? row("When", p.when) : ""}${p.where ? row("Where", p.where) : ""}${row("Ticket code", p.ticketCode)}
</table></td></tr>
<tr><td style="padding:0 24px"><div style="border-top:1px dashed ${PERFORATION}"></div></td></tr>
<tr><td align="center" style="padding:20px 24px 8px">
<img src="cid:${e(p.qrCid)}" width="240" height="240" alt="QR code for ${e(p.guestName)}'s pass" style="display:block;width:240px;height:240px;border:0">
</td></tr>
<tr><td align="center" style="padding:0 24px 24px">
<p style="margin:0 0 4px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:16px;letter-spacing:1px">${e(p.ticketCode)}</p>
<p style="margin:0;color:${MUTED};font-size:13px">Show this at the door. If it won't scan, read out the code.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
