import type { EventPhase } from "../../types";
import { eventPhase } from "../event-phase.ts";

/**
 * What the Glance card shows, worked out from the event, its ticket types and
 * their registration counts. Plain data and no I/O, so the page can hand it
 * to the card and the rules here can be tested on their own.
 */

/**
 * How a ticket type is drawn in the bar and its legend: one of the five data
 * colours (design-spec.md, series-1 to series-5), biggest first, or the
 * shared "rest" colour past the fifth. The legend names every type, with its
 * number, so colour is never the only way to tell them apart.
 */
export type Tone = 1 | 2 | 3 | 4 | 5 | "rest";

/** Bar order: the five colours, then the rest. */
export const TONES: readonly Tone[] = [1, 2, 3, 4, 5, "rest"];

export type GlanceType = {
	id: string;
	name: string;
	registered: number;
	tone: Tone;
};

/** One stretch of the bar. Types that share the "rest" tone share a stretch. */
export type GlanceSegment = { tone: Tone; registered: number; share: number };

export type Glance = {
	phase: EventPhase;
	/**
	 * What the bar and its legend split registrations by: the tickets, or,
	 * with only one ticket (which would say nothing), the answers to the
	 * form's first single-choice question, named here.
	 */
	splitBy: string | null;
	/** The bar's parts, in legend order: tickets, or answers. */
	groups: GlanceType[];
	registered: number;
	/** Places in all; null when nothing limits them. */
	limit: number | null;
	/** registered / limit, 0–100; null without a limit. */
	percentFilled: number | null;
	/** limit − registered, never below 0; null without a limit. */
	remaining: number | null;
	fill: "open" | "almost-full" | "sold-out";
	types: GlanceType[];
	segments: GlanceSegment[];
	lastRegisteredAt: Date | null;
};

export type GlanceInput = {
	published: boolean;
	startsAt: Date | null;
	endsAt: Date | null;
	timeZone: string | null;
	capacity: bigint | null;
	/** In the host's order. */
	ticketTypes: { id: string; name: string; capacity: bigint | null }[];
	/** Registrations per ticket type id. A type that is missing has none. */
	registered: ReadonlyMap<string, number>;
	lastRegisteredAt: Date | null;
	/**
	 * Registrations per answer to the form's first single-choice question
	 * (Profession, on a new event); used when there is one ticket. Null when
	 * the form has no such question.
	 */
	split?: ChoiceSplit | null;
};

export type ChoiceSplit = {
	/** The question, as the form words it. */
	label: string;
	/** Per answer, in the form's order; "Other" and "No answer" last. */
	answers: { id: string; name: string; registered: number }[];
};

/**
 * Biggest first, ties in the given order, each with its colour: the five
 * data colours, then "rest". The legend follows this order too, so its
 * first dot is the bar's first stretch.
 */
function ranked(
	items: readonly { id: string; name: string; registered: number }[],
): GlanceType[] {
	return items
		.map((item, position) => ({ ...item, position }))
		.sort((a, b) => b.registered - a.registered || a.position - b.position)
		.map((item, rank) => ({
			id: item.id,
			name: item.name,
			registered: item.registered,
			tone: (TONES[rank] as Tone | undefined) ?? "rest",
		}));
}

/** At or past this share of places, the card says the event is almost full. */
export const ALMOST_FULL_PERCENT = 90;

/**
 * The most people the event can take. The event's own limit, and the sum of
 * the ticket limits when every ticket has one; whichever is lower. One ticket
 * without a limit and no event limit means no limit at all.
 */
export function placesLimit(
	capacity: bigint | null,
	ticketCapacities: readonly (bigint | null)[],
): number | null {
	let sum: bigint | null = ticketCapacities.length > 0 ? 0n : null;
	for (const each of ticketCapacities) {
		if (each === null || sum === null) {
			sum = null;
			break;
		}
		sum += each;
	}
	const limits = [capacity, sum].filter((n): n is bigint => n !== null);
	if (limits.length === 0) return null;
	const lowest = limits.reduce((a, b) => (b < a ? b : a));
	// Far beyond any venue, but a bigint has no ceiling and a number does.
	return lowest > BigInt(Number.MAX_SAFE_INTEGER)
		? Number.MAX_SAFE_INTEGER
		: Number(lowest);
}

export function glanceOf(input: GlanceInput, now: Date): Glance {
	const types = ranked(
		input.ticketTypes.map((type) => ({
			id: type.id,
			name: type.name,
			registered: Math.max(0, input.registered.get(type.id) ?? 0),
		})),
	);

	const registered = types.reduce((sum, type) => sum + type.registered, 0);

	// One ticket: its name in the legend only repeats the total, so the bar
	// shows who they are instead, when the form asks.
	// Before anyone registers there is nothing to split; the ticket stays.
	const split =
		input.ticketTypes.length === 1 && input.split && registered > 0
			? input.split
			: null;
	const groups = split
		? ranked(
				split.answers
					.filter((answer) => answer.registered > 0)
					.map((answer) => ({
						...answer,
						registered: Math.max(0, answer.registered),
					})),
			)
		: types;
	const limit = placesLimit(
		input.capacity,
		input.ticketTypes.map((type) => type.capacity),
	);

	// Without a limit the bar shows how registrations split between tickets,
	// across its whole width.
	// More registered than places (the limit was lowered after they came)
	// fills the bar, never overruns it.
	const whole = Math.max(limit ?? 0, registered);
	const segments: GlanceSegment[] = [];
	if (whole > 0) {
		for (const tone of TONES) {
			const inTone = groups
				.filter((type) => type.tone === tone)
				.reduce((sum, type) => sum + type.registered, 0);
			if (inTone > 0)
				segments.push({
					tone,
					registered: inTone,
					share: Math.min(100, (inTone / whole) * 100),
				});
		}
	}

	const percentFilled =
		limit === null ? null : Math.min(100, (registered / limit) * 100);

	return {
		phase: eventPhase(input, now),
		registered,
		limit,
		percentFilled,
		remaining: limit === null ? null : Math.max(0, limit - registered),
		fill:
			limit !== null && registered >= limit
				? "sold-out"
				: percentFilled !== null && percentFilled >= ALMOST_FULL_PERCENT
					? "almost-full"
					: "open",
		types,
		splitBy: split?.label ?? null,
		groups,
		segments,
		lastRegisteredAt: input.lastRegisteredAt,
	};
}
