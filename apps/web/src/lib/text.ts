/**
 * Text folded for matching what someone types: lowercase, and every run of
 * anything but letters and digits as one space. "T-Shirt  size" and
 * "t shirt size" fold to the same thing.
 */
export function fold(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Text made safe to place inside HTML, in text or in a quoted attribute. */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
