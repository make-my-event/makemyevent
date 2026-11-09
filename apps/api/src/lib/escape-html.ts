/**
 * Escapes text for safe insertion into HTML element content and quoted
 * attribute values. Use for every user- or organizer-controlled value placed in
 * an HTML email template.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Makes text safe for a single-line header such as an email subject: control
 * characters (including CR and LF) become spaces and runs of whitespace collapse.
 */
export function toHeaderText(value: string): string {
	let out = "";
	for (const char of value) {
		const code = char.charCodeAt(0);
		out += code < 0x20 || code === 0x7f ? " " : char;
	}
	return out.replace(/\s+/g, " ").trim();
}
