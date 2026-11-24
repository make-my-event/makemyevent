import { z } from "zod";

/** The longest event title, matching the events table's check. */
export const EVENT_TITLE_MAX = 120;

/**
 * What the Create Event popup sends. Only the person themselves can host for
 * now; organizations will add their ids here when that screen exists.
 */
export const createEventInput = z.object({
	title: z
		.string()
		.trim()
		.min(1, "Give the event a name.")
		.max(EVENT_TITLE_MAX, `Keep the name under ${EVENT_TITLE_MAX} characters.`),
	host: z.literal("me", { error: "Choose who hosts the event." }),
});

/** Words an event's address may not be, because a /dashboard page has them. */
export const RESERVED_EVENT_SLUGS: ReadonlySet<string> = new Set([
	"organized",
	"attending",
]);

const SLUG_MAX = 60;

/**
 * An event's address from its title: "Winter Build: 2026!" becomes
 * "winter-build-2026". Lowercase letters and digits joined by single hyphens,
 * the shape the events table checks for.
 *
 * Accents are dropped ("Café" → "cafe"). A title with no Latin letters or
 * digits at all gives "event", and the caller numbers it like any clash.
 */
export function slugFromTitle(title: string): string {
	const base = title
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, SLUG_MAX)
		.replace(/-+$/g, "");
	if (!base || RESERVED_EVENT_SLUGS.has(base))
		return base ? `${base}-event` : "event";
	return base;
}

/**
 * The address to try on the nth attempt: the base, then base-2, base-3 and
 * so on, shortened so the number always fits.
 */
export function numberedSlug(base: string, attempt: number): string {
	if (attempt <= 1) return base;
	const suffix = `-${attempt}`;
	return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

/** The longest address a host may type; the database allows a little more. */
export const ADDRESS_MAX = 60;
/** The most places an event can offer from this form. */
export const CAPACITY_MAX = 1_000_000;

/**
 * An address as a host types it: trimmed and lowercased, then held to the
 * shape the events table checks for (lowercase letters and digits, single
 * hyphens between them).
 */
export const eventAddress = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, "Give the event an address.")
	.max(ADDRESS_MAX, `Keep the address under ${ADDRESS_MAX} characters.`)
	.regex(
		/^[a-z0-9]+(-[a-z0-9]+)*$/,
		"Use lowercase letters, numbers and single hyphens, like design-summit-26.",
	)
	.refine((value) => !RESERVED_EVENT_SLUGS.has(value), {
		message: "That address is reserved. Try another.",
	});

/**
 * The Event Page tab's form: the public address and how guests get in.
 * Capacity arrives as typed; empty means no limit.
 */
/** Matching the events table's check on poster_alt. */
export const POSTER_ALT_MAX = 250;

export const eventPageInput = z.object({
	address: eventAddress,
	posterAlt: z
		.string()
		.trim()
		.max(
			POSTER_ALT_MAX,
			`Keep the description under ${POSTER_ALT_MAX} characters.`,
		)
		.transform((value) => (value === "" ? null : value)),
	inviteOnly: z.boolean(),
	listed: z.boolean(),
	registrationClosed: z.boolean(),
	capacity: z
		.string()
		.trim()
		.transform((value, context) => {
			if (value === "") return null;
			if (!/^\d+$/.test(value)) {
				context.addIssue({
					code: "custom",
					message: "Enter a whole number of places.",
				});
				return z.NEVER;
			}
			const places = Number(value);
			if (places < 1 || places > CAPACITY_MAX) {
				context.addIssue({
					code: "custom",
					message: `Enter between 1 and ${CAPACITY_MAX.toLocaleString("en-US")} places, or leave it empty for no limit.`,
				});
				return z.NEVER;
			}
			return places;
		}),
});
