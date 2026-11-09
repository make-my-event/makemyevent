/**
 * Serialises structured data for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` does not escape `<`, so a value such as an event title
 * containing `</script><script>` would close the tag early wherever this is
 * server-rendered into HTML. Escaping `<`, `>` and `&` (and the U+2028/U+2029
 * line separators) as Unicode escapes keeps the JSON identical for parsers
 * while making a tag break-out impossible.
 */
const LINE_SEPARATOR = /\u2028/g;
const PARAGRAPH_SEPARATOR = /\u2029/g;

export function toJsonLd(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(LINE_SEPARATOR, "\\u2028")
		.replace(PARAGRAPH_SEPARATOR, "\\u2029");
}
