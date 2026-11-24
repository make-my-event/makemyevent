import { safeLink } from "./about.ts";

/**
 * Where an event happens: in person (a place), online (a link), or both.
 * The labels are what hosts read; the values are what the events table
 * stores (offline, online, hybrid).
 */
export const EVENT_FORMATS = ["offline", "online", "hybrid"] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];
export const FORMAT_LABELS: Record<EventFormat, string> = {
	offline: "In person",
	online: "Online",
	hybrid: "Hybrid",
};

export type VenueField =
	| "format"
	| "venueAddress"
	| "venueName"
	| "onlineUrl"
	| "pin";
export type VenueInput = {
	format: string;
	venueAddress: string;
	venueName: string;
	lat: number | null;
	lng: number | null;
	onlineUrl: string;
};
export type VenueValues = {
	format: EventFormat;
	venueAddress: string | null;
	venueName: string | null;
	venueLat: number | null;
	venueLng: number | null;
	onlineUrl: string | null;
};

/**
 * Checks the Venue card. A draft may leave things empty; what it fills must
 * fit the format. An online event keeps no place, an in-person one no link,
 * so switching format never leaves the other's details behind unseen.
 */
export function checkVenue(
	input: VenueInput,
):
	| { ok: true; values: VenueValues }
	| { ok: false; field: VenueField; message: string } {
	const format = EVENT_FORMATS.find((value) => value === input.format);
	if (!format)
		return { ok: false, field: "format", message: "Choose how people attend." };
	const inPerson = format !== "online";
	const online = format !== "offline";

	const venueAddress = inPerson ? input.venueAddress.trim() : "";
	const venueName = inPerson ? input.venueName.trim() : "";
	if (venueAddress.length > 500)
		return {
			ok: false,
			field: "venueAddress",
			message: "Keep the address under 500 characters.",
		};
	if (venueName.length > 200)
		return {
			ok: false,
			field: "venueName",
			message: "Keep the name under 200 characters.",
		};

	let lat = inPerson ? input.lat : null;
	let lng = inPerson ? input.lng : null;
	if ((lat === null) !== (lng === null)) lat = lng = null;
	if (
		lat !== null &&
		lng !== null &&
		!(
			Number.isFinite(lat) &&
			Number.isFinite(lng) &&
			Math.abs(lat) <= 90 &&
			Math.abs(lng) <= 180
		)
	)
		return {
			ok: false,
			field: "pin",
			message: "Place the pin on the map again.",
		};

	let onlineUrl: string | null = null;
	const typed = online ? input.onlineUrl.trim() : "";
	if (typed) {
		const link = safeLink(
			/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`,
		);
		if (!link?.startsWith("https://"))
			return {
				ok: false,
				field: "onlineUrl",
				message: "Use a web address that starts with https://.",
			};
		onlineUrl = link;
	}

	return {
		ok: true,
		values: {
			format,
			venueAddress: venueAddress || null,
			venueName: venueName || null,
			venueLat: lat,
			venueLng: lng,
			onlineUrl,
		},
	};
}
