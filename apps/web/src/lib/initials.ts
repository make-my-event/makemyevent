/**
 * Up to two initials for an avatar: the first letter of the first and last
 * words of `name` ("Asha Kumar" -> "AK", "Asha" -> "A"). Falls back to the
 * first letter of `email`, then "?".
 */
export function getInitials(
	name: string | null | undefined,
	email?: string | null,
): string {
	const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (words.length > 0) {
		const first = words[0].charAt(0);
		const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
		return `${first}${last}`.toUpperCase();
	}
	const fromEmail = (email ?? "").trim().charAt(0);
	return fromEmail ? fromEmail.toUpperCase() : "?";
}
