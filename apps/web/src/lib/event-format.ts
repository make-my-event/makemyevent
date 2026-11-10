/**
 * Display formatting for event cards. Everything goes through `Intl` so dates
 * and currency follow locale rules instead of hand-built strings.
 *
 * The platform prices tickets in whole Indian rupees (see `parseTicketPrice`
 * in `numeric-field.ts`), so currency is INR with no minor units.
 */

export const EVENT_LOCALE = "en-IN";
export const DEFAULT_EVENT_TIMEZONE = "Asia/Kolkata";

const priceFormatter = new Intl.NumberFormat(EVENT_LOCALE, {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
});

function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat(EVENT_LOCALE, { timeZone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Formats an event's start as e.g. "Sat, 14 Nov, 6:30 pm" in the event's own
 * timezone, so every visitor sees the time the organizer advertised. Falls
 * back to the platform default when the stored timezone is not a valid IANA
 * name.
 */
export function formatEventStart(start: Date, timeZone: string): string {
	return new Intl.DateTimeFormat(EVENT_LOCALE, {
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
		timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_EVENT_TIMEZONE,
	}).format(start);
}

export interface TicketPriceSummary {
	/** Price of the cheapest published tier, or null when there is none. */
	cheapestPrice: number | null;
	/** Number of published tiers. */
	tierCount: number;
}

/**
 * Short price label for a card: "Free", "₹499", "From ₹499", or null when the
 * event has no published tickets yet (the card then omits the price rather
 * than guessing).
 */
export function formatTicketPrice({
	cheapestPrice,
	tierCount,
}: TicketPriceSummary): string | null {
	if (cheapestPrice === null || tierCount === 0) return null;
	if (cheapestPrice <= 0) return "Free";
	const amount = priceFormatter.format(cheapestPrice);
	return tierCount > 1 ? `From ${amount}` : amount;
}

/**
 * Price label from a raw list of tiers (as returned by `events.list`, which
 * is not pre-sorted). Picks the cheapest tier rather than whichever happens to
 * come first.
 */
export function getCardPriceLabel(
	tickets: ReadonlyArray<{ price: number }>,
): string | null {
	if (tickets.length === 0) return null;
	const cheapestPrice = Math.min(...tickets.map((t) => t.price));
	return formatTicketPrice({ cheapestPrice, tierCount: tickets.length });
}

export interface EventDateParts {
	/** Day of month, e.g. "25". */
	day: string;
	/** Short month, e.g. "Nov". */
	month: string;
	/** Short weekday, e.g. "Wed". */
	weekday: string;
}

/**
 * Calendar-style pieces of an event's start date in the event's timezone,
 * for large date displays (e.g. a banner fallback).
 */
export function getEventDateParts(
	start: Date,
	timeZone: string,
): EventDateParts {
	const parts = new Intl.DateTimeFormat(EVENT_LOCALE, {
		day: "numeric",
		month: "short",
		weekday: "short",
		timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_EVENT_TIMEZONE,
	}).formatToParts(start);
	const get = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((p) => p.type === type)?.value ?? "";
	return { day: get("day"), month: get("month"), weekday: get("weekday") };
}
