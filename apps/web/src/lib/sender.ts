/**
 * The From line of every email, from EMAIL_FROM, in the one shape the email
 * service takes: "name@domain" or "Name <name@domain>".
 *
 * Quote marks around the whole value are taken off, as a .env file would:
 * pasted into a hosting dashboard they are kept, and the service then
 * refuses every message. Anything else that isn't that shape is null, so the
 * site says the setting is wrong instead of failing on each send.
 */
export function senderOf(raw: string | undefined): string | null {
	let text = (raw ?? "").trim();
	const quoted = /^(["'])(.*)\1$/.exec(text);
	if (quoted) text = (quoted[2] ?? "").trim();
	const address = '[^\\s@<>"]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+';
	if (new RegExp(`^${address}$`).test(text)) return text;
	const named = new RegExp(`^([^<>"\\r\\n]+?)\\s*<(${address})>$`).exec(text);
	return named ? `${named[1]} <${named[2]}>` : null;
}
