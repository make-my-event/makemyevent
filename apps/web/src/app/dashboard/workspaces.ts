import type { Workspace } from "./types";

/**
 * The person's display name, from the session the server has verified: the
 * name Google gave, else the email. Shown in the header and as the personal
 * host, and stored as users.display_name (1 to 100 characters).
 */
export function displayNameOf(user: {
	email?: string | undefined;
	user_metadata?: { full_name?: unknown; name?: unknown } | undefined;
}): string {
	const metadata = user.user_metadata ?? {};
	const candidates = [metadata.full_name, metadata.name, user.email];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim())
			return value.trim().slice(0, 100);
	}
	return "Your events";
}

/**
 * Whom the person can create and list events for. One for now: themselves.
 * Organizations are a model that does not exist yet; everything that takes
 * this list takes a list rather than assuming its length.
 */
export function workspacesFor(user: Parameters<typeof displayNameOf>[0]) {
	return [
		{
			id: "me",
			name: displayNameOf(user),
			href: "/dashboard",
			personal: true,
		},
	] as const satisfies readonly Workspace[];
}
