/**
 * The cookie that keeps which form questions the Guests list shows as
 * columns, per event. Its own module so the server page and the list share
 * the name. Its value is question ids joined by dots; anything else in it
 * is ignored.
 */
export function columnsCookie(eventId: string): string {
	return `guest-columns-${eventId}`;
}

export function readColumns(
	value: string | undefined,
	known: readonly { id: string }[],
): string[] {
	if (!value) return [];
	const ids = new Set(known.map((column) => column.id));
	return value.split(".").filter((id) => ids.has(id));
}
