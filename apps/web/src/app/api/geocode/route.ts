import { getCurrentUser } from "@/lib/supabase/identity";

/**
 * Place search for the Venue card: GET ?q= returns up to five places with
 * a label and coordinates. GET ?lat=&lng= returns the place at a spot on
 * the map ({ place }, or null where there is no address), for a pin
 * dropped by hand.
 *
 * The search runs on Photon (OpenStreetMap data, free, no key), but through
 * this route rather than from the browser: the host's typing reaches one
 * outside service, not with their IP or cookies, and only for signed-in
 * hosts, at a pace Photon's fair-use terms allow.
 */

const PHOTON = "https://photon.komoot.io/api/";
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";
const QUERY_MAX = 200;

/** Per person: 20 searches in any 10 seconds is fast typing, not a bot. */
const WINDOW_MS = 10_000;
const PER_WINDOW = 20;
const recent = new Map<string, number[]>();

function allowed(userId: string): boolean {
	const now = Date.now();
	const times = (recent.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
	if (times.length >= PER_WINDOW) {
		recent.set(userId, times);
		return false;
	}
	times.push(now);
	recent.set(userId, times);
	if (recent.size > 5000) {
		for (const [key, list] of recent)
			if (!list.some((at) => now - at < WINDOW_MS)) recent.delete(key);
	}
	return true;
}

type PhotonFeature = {
	geometry?: { coordinates?: [number, number] };
	properties?: Record<string, unknown>;
};

export type Place = { name: string; label: string; lat: number; lng: number };

function text(value: unknown): string {
	return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

/** "Pepper House, Kalvathy Road, Fort Kochi, Kochi, Kerala, India" */
function toPlace(feature: PhotonFeature): Place | null {
	const [lng, lat] = feature.geometry?.coordinates ?? [];
	if (
		typeof lat !== "number" ||
		typeof lng !== "number" ||
		Math.abs(lat) > 90 ||
		Math.abs(lng) > 180
	)
		return null;
	const p = feature.properties ?? {};
	const street = [text(p.housenumber), text(p.street)]
		.filter(Boolean)
		.join(" ");
	const parts = [
		text(p.name),
		street,
		text(p.district) || text(p.locality),
		text(p.city),
		text(p.state),
		text(p.country),
	].filter(Boolean);
	const unique = parts.filter((part, i) => parts.indexOf(part) === i);
	if (unique.length === 0) return null;
	return {
		name: unique[0] ?? "",
		label: unique.join(", "),
		lat: Math.round(lat * 1e6) / 1e6,
		lng: Math.round(lng * 1e6) / 1e6,
	};
}

export async function GET(request: Request) {
	const user = await getCurrentUser();
	if (!user)
		return Response.json(
			{ error: "Sign in to search places." },
			{ status: 401 },
		);

	const params = new URL(request.url).searchParams;
	if (params.has("lat") || params.has("lng")) {
		const lat = Number(params.get("lat"));
		const lng = Number(params.get("lng"));
		if (
			!Number.isFinite(lat) ||
			!Number.isFinite(lng) ||
			Math.abs(lat) > 90 ||
			Math.abs(lng) > 180
		)
			return Response.json(
				{ error: "That spot is not on the map." },
				{ status: 400 },
			);
		if (!allowed(user.id)) return tooFast();
		return reverse(lat, lng);
	}

	const q = params.get("q")?.trim() ?? "";
	if (q.length < 3) return Response.json({ places: [] });
	if (q.length > QUERY_MAX)
		return Response.json(
			{ error: "That search is too long." },
			{ status: 400 },
		);

	if (!allowed(user.id)) return tooFast();

	const url = new URL(PHOTON);
	url.searchParams.set("q", q);
	url.searchParams.set("limit", "5");
	url.searchParams.set("lang", "en");
	try {
		const response = await fetch(url, {
			headers: { "User-Agent": "makemyevent (open-source event ticketing)" },
			signal: AbortSignal.timeout(4000),
			next: { revalidate: 86400 },
		});
		if (!response.ok) throw new Error(`Photon ${response.status}`);
		const body = (await response.json()) as { features?: PhotonFeature[] };
		// OpenStreetMap can hold one place twice (as a point and as a
		// building, say): Photon returns both, identical once labelled.
		const seen = new Set<string>();
		const places = (body.features ?? [])
			.map(toPlace)
			.filter((place): place is Place => {
				if (!place) return false;
				const key = `${place.lat},${place.lng},${place.label}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		return Response.json(
			{ places },
			{ headers: { "Cache-Control": "private, max-age=300" } },
		);
	} catch {
		return Response.json(
			{
				error:
					"Place search is not answering. Drop the pin on the map instead.",
			},
			{ status: 502 },
		);
	}
}

function tooFast() {
	return Response.json(
		{ error: "Searching too fast. Wait a moment." },
		{ status: 429, headers: { "Retry-After": "10" } },
	);
}

/** The nearest addressed place to a spot. The pin stays where it was put. */
async function reverse(lat: number, lng: number) {
	const url = new URL(PHOTON_REVERSE);
	// Rounded to about 10 m: close enough for an address, and repeat
	// clicks on one spot share the cached answer.
	url.searchParams.set("lat", lat.toFixed(4));
	url.searchParams.set("lon", lng.toFixed(4));
	url.searchParams.set("limit", "1");
	url.searchParams.set("lang", "en");
	try {
		const response = await fetch(url, {
			headers: { "User-Agent": "makemyevent (open-source event ticketing)" },
			signal: AbortSignal.timeout(4000),
			next: { revalidate: 86400 },
		});
		if (!response.ok) throw new Error(`Photon ${response.status}`);
		const body = (await response.json()) as { features?: PhotonFeature[] };
		const found = body.features?.[0] ? toPlace(body.features[0]) : null;
		return Response.json(
			{ place: found ? { ...found, lat, lng } : null },
			{ headers: { "Cache-Control": "private, max-age=300" } },
		);
	} catch {
		return Response.json(
			{ error: "Could not look up this spot. Type the address above." },
			{ status: 502 },
		);
	}
}
