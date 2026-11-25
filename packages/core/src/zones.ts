/**
 * Time zones as a person looks for them: by city, by offset ("5:30"), by
 * name ("India Standard Time") or by its initials ("IST").
 */

/** Cities renamed since: browsers list some under the old name, some the new. */
const RENAMED: Readonly<Record<string, string>> = {
	"Africa/Asmera": "Africa/Asmara",
	"America/Buenos_Aires": "America/Argentina/Buenos_Aires",
	"America/Catamarca": "America/Argentina/Catamarca",
	"America/Coral_Harbour": "America/Atikokan",
	"America/Cordoba": "America/Argentina/Cordoba",
	"America/Godthab": "America/Nuuk",
	"America/Indianapolis": "America/Indiana/Indianapolis",
	"America/Jujuy": "America/Argentina/Jujuy",
	"America/Louisville": "America/Kentucky/Louisville",
	"America/Mendoza": "America/Argentina/Mendoza",
	"Asia/Calcutta": "Asia/Kolkata",
	"Asia/Katmandu": "Asia/Kathmandu",
	"Asia/Rangoon": "Asia/Yangon",
	"Asia/Saigon": "Asia/Ho_Chi_Minh",
	"Atlantic/Faeroe": "Atlantic/Faroe",
	"Europe/Kiev": "Europe/Kyiv",
	"Pacific/Enderbury": "Pacific/Kanton",
	"Pacific/Ponape": "Pacific/Pohnpei",
	"Pacific/Truk": "Pacific/Chuuk",
};

/** A zone's name as it is shown: "Asia/Kolkata", "America/New York". */
export function zoneName(zone: string): string {
	return (RENAMED[zone] ?? zone).replaceAll("_", " ");
}

/**
 * What to call the zone beside a time: "GMT+5:30", or "PST" where the zone
 * has a short name people know. Empty for a zone the platform doesn't.
 */
export function zoneShort(at: Date, zone: string | null): string {
	try {
		return (
			new Intl.DateTimeFormat("en-US", {
				timeZone: zone ?? "UTC",
				timeZoneName: "short",
			})
				.formatToParts(at)
				.find((part) => part.type === "timeZoneName")?.value ?? ""
		);
	} catch {
		return "";
	}
}

export type ZoneOption = {
	zone: string;
	/** "Asia/Kolkata" */
	name: string;
	/** "UTC+05:30" */
	offset: string;
	/** "India Standard Time" */
	longName: string;
	/** Everything it can be found by. */
	search: string;
};

const plain = (text: string) =>
	text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/−/g, "-")
		.replace(/[\s_/,]+/g, " ")
		.trim();

/** One of a zone's names at that moment. One formatter each: they are slow to make. */
function named(zone: string, at: Date, style: "long" | "longOffset"): string {
	return (
		new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: style })
			.formatToParts(at)
			.find((part) => part.type === "timeZoneName")?.value ?? ""
	);
}

/** One zone, with its offset and name at that moment; null if not a zone. */
export function zoneOption(zone: string, at: Date): ZoneOption | null {
	let offset: string;
	let longName: string;
	try {
		// "GMT+05:30", or "GMT" alone for none.
		const gmt = named(zone, at, "longOffset").slice(3);
		offset = `UTC${gmt.replace("-", "\u2212") || "+00:00"}`;
		longName = named(zone, at, "long");
	} catch {
		return null;
	}
	const name = zoneName(zone);
	const initials = longName.replace(/[^A-Z]/g, "");
	// "+05:30" and "+5:30", after UTC or GMT or on their own.
	const padded = plain(offset).slice(3);
	const short = padded.replace(/^([+-])0/, "$1");
	return {
		zone,
		name,
		offset,
		longName,
		search: plain(
			[
				name,
				zone,
				longName,
				initials,
				`utc${padded} utc${short} gmt${padded} gmt${short}`,
			].join(" "),
		),
	};
}

/**
 * The list to choose from: every zone once, west to east, whatever names
 * the browser lists them under. A zone already chosen keeps its own id, so
 * opening the list never changes what is saved.
 */
export function arrangeZones(
	options: readonly ZoneOption[],
	current: ZoneOption | null,
): ZoneOption[] {
	const byName = new Map<string, ZoneOption>();
	for (const option of current ? [current, ...options] : options)
		if (!byName.has(option.name)) byName.set(option.name, option);
	const minutes = (option: ZoneOption) => {
		const m = /^UTC([+−])(\d+):(\d+)$/.exec(option.offset);
		if (!m) return 0;
		return (m[1] === "+" ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
	};
	return [...byName.values()].sort(
		(a, b) => minutes(a) - minutes(b) || a.name.localeCompare(b.name, "en"),
	);
}

/** Those every word of the search is found in. */
export function searchZones(
	options: readonly ZoneOption[],
	query: string,
): ZoneOption[] {
	const words = plain(query).split(" ").filter(Boolean);
	return options.filter((option) =>
		words.every((word) => option.search.includes(word)),
	);
}
