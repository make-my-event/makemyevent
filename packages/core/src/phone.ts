/**
 * Phone numbers: what may be typed or imported, and the one form they are
 * stored in (E.164: "+919876543210"), so the same number always matches.
 *
 * A number typed on its own is taken as Indian, the country most guests are
 * in; any other country is chosen beside the box, or written with its +code.
 */

/** The country a number belongs to when none is given. */
export const DEFAULT_COUNTRY = "IN";

/**
 * Countries that write a 0 before a number at home and drop it after the
 * country code ("020 7946 0958" is +44 20 7946 0958). Others (Italy, Côte
 * d'Ivoire, the Congo) keep theirs, so a 0 is only dropped for these.
 */
const DROPS_ZERO = new Set(
	(
		"91 44 33 49 61 62 63 60 66 84 81 82 86 92 94 95 880 977 971 966 968 962 " +
		"961 972 20 27 212 213 234 233 254 255 256 31 32 41 43 45 46 47 353 358 " +
		"40 380 90 98 64 55 54 51 57 58"
	).split(" "),
);

const compactOf = (raw: string) =>
	raw
		.replace(/^tel:/i, "")
		.replace(/[\s(). ‐-―-]/g, "")
		// The international prefix most of the world dials for +.
		.replace(/^00(?=[1-9])/, "+");

/**
 * "+91 98765-43210", "98765 43210" or "098765 43210" to "+919876543210";
 * null when it can't be a phone number. With a + the country code is taken
 * as written. Without one, only what is plainly an Indian number is: ten
 * digits from 6 to 9, or a 0 and ten digits. Anything else could be from
 * anywhere, and a wrong guess would store someone else's number.
 */
export function phoneDigits(raw: string): string | null {
	let compact = compactOf(raw);
	if (/^[6-9][0-9]{9}$/.test(compact)) compact = `+91${compact}`;
	else if (/^0[1-9][0-9]{9}$/.test(compact)) compact = `+91${compact.slice(1)}`;
	else if (/^91[6-9][0-9]{9}$/.test(compact)) compact = `+${compact}`;

	if (!/^\+[1-9][0-9]{6,14}$/.test(compact)) return null;
	const indian = /^\+910?([0-9]*)$/.exec(compact);
	if (!indian) return compact;
	// India's are all ten digits, so a slip of one shows here.
	const national = indian[1] ?? "";
	return /^[1-9][0-9]{9}$/.test(national) ? `+91${national}` : null;
}

export type Country = {
	/** ISO 3166: "IN". */
	iso: string;
	name: string;
	/** Its calling code, without the +: "91". */
	dial: string;
};

// The first listed is the one a shared code is read as: +1 is the US, +44
// the UK, +7 Russia.
const TABLE =
	"AF Afghanistan 93|AL Albania 355|DZ Algeria 213|AS American Samoa 1684|AD Andorra 376|AO Angola 244|" +
	"AI Anguilla 1264|AG Antigua & Barbuda 1268|AR Argentina 54|AM Armenia 374|AW Aruba 297|AU Australia 61|" +
	"AT Austria 43|AZ Azerbaijan 994|BS Bahamas 1242|BH Bahrain 973|BD Bangladesh 880|BB Barbados 1246|" +
	"BY Belarus 375|BE Belgium 32|BZ Belize 501|BJ Benin 229|BM Bermuda 1441|BT Bhutan 975|BO Bolivia 591|" +
	"BA Bosnia & Herzegovina 387|BW Botswana 267|BR Brazil 55|IO British Indian Ocean Territory 246|" +
	"VG British Virgin Islands 1284|BN Brunei 673|BG Bulgaria 359|BF Burkina Faso 226|BI Burundi 257|" +
	"KH Cambodia 855|CM Cameroon 237|US United States 1|CA Canada 1|CV Cape Verde 238|KY Cayman Islands 1345|" +
	"CF Central African Republic 236|TD Chad 235|CL Chile 56|CN China 86|CO Colombia 57|KM Comoros 269|" +
	"CG Congo (Brazzaville) 242|CD Congo (Kinshasa) 243|CK Cook Islands 682|CR Costa Rica 506|" +
	"CI Côte d’Ivoire 225|HR Croatia 385|CU Cuba 53|CW Curaçao 599|CY Cyprus 357|CZ Czechia 420|DK Denmark 45|" +
	"DJ Djibouti 253|DM Dominica 1767|DO Dominican Republic 1809|EC Ecuador 593|EG Egypt 20|SV El Salvador 503|" +
	"GQ Equatorial Guinea 240|ER Eritrea 291|EE Estonia 372|SZ Eswatini 268|ET Ethiopia 251|" +
	"FK Falkland Islands 500|FO Faroe Islands 298|FJ Fiji 679|FI Finland 358|FR France 33|GF French Guiana 594|" +
	"PF French Polynesia 689|GA Gabon 241|GM Gambia 220|GE Georgia 995|DE Germany 49|GH Ghana 233|" +
	"GI Gibraltar 350|GR Greece 30|GL Greenland 299|GD Grenada 1473|GP Guadeloupe 590|GU Guam 1671|" +
	"GT Guatemala 502|GN Guinea 224|GW Guinea-Bissau 245|GY Guyana 592|HT Haiti 509|HN Honduras 504|" +
	"HK Hong Kong 852|HU Hungary 36|IS Iceland 354|IN India 91|ID Indonesia 62|IR Iran 98|IQ Iraq 964|" +
	"IE Ireland 353|IL Israel 972|IT Italy 39|JM Jamaica 1876|JP Japan 81|JO Jordan 962|RU Russia 7|" +
	"KZ Kazakhstan 7|KE Kenya 254|KI Kiribati 686|XK Kosovo 383|KW Kuwait 965|KG Kyrgyzstan 996|LA Laos 856|" +
	"LV Latvia 371|LB Lebanon 961|LS Lesotho 266|LR Liberia 231|LY Libya 218|LI Liechtenstein 423|" +
	"LT Lithuania 370|LU Luxembourg 352|MO Macao 853|MG Madagascar 261|MW Malawi 265|MY Malaysia 60|" +
	"MV Maldives 960|ML Mali 223|MT Malta 356|MH Marshall Islands 692|MQ Martinique 596|MR Mauritania 222|" +
	"MU Mauritius 230|MX Mexico 52|FM Micronesia 691|MD Moldova 373|MC Monaco 377|MN Mongolia 976|" +
	"ME Montenegro 382|MS Montserrat 1664|MA Morocco 212|MZ Mozambique 258|MM Myanmar 95|NA Namibia 264|" +
	"NR Nauru 674|NP Nepal 977|NL Netherlands 31|NC New Caledonia 687|NZ New Zealand 64|NI Nicaragua 505|" +
	"NE Niger 227|NG Nigeria 234|NU Niue 683|KP North Korea 850|MK North Macedonia 389|" +
	"MP Northern Mariana Islands 1670|NO Norway 47|OM Oman 968|PK Pakistan 92|PW Palau 680|PS Palestine 970|" +
	"PA Panama 507|PG Papua New Guinea 675|PY Paraguay 595|PE Peru 51|PH Philippines 63|PL Poland 48|" +
	"PT Portugal 351|PR Puerto Rico 1787|QA Qatar 974|RE Réunion 262|RO Romania 40|RW Rwanda 250|" +
	"WS Samoa 685|SM San Marino 378|ST São Tomé & Príncipe 239|SA Saudi Arabia 966|SN Senegal 221|" +
	"RS Serbia 381|SC Seychelles 248|SL Sierra Leone 232|SG Singapore 65|SX Sint Maarten 1721|SK Slovakia 421|" +
	"SI Slovenia 386|SB Solomon Islands 677|SO Somalia 252|ZA South Africa 27|KR South Korea 82|" +
	"SS South Sudan 211|ES Spain 34|LK Sri Lanka 94|SH St Helena 290|KN St Kitts & Nevis 1869|LC St Lucia 1758|" +
	"PM St Pierre & Miquelon 508|VC St Vincent & Grenadines 1784|SD Sudan 249|SR Suriname 597|SE Sweden 46|" +
	"CH Switzerland 41|SY Syria 963|TW Taiwan 886|TJ Tajikistan 992|TZ Tanzania 255|TH Thailand 66|" +
	"TL Timor-Leste 670|TG Togo 228|TK Tokelau 690|TO Tonga 676|TT Trinidad & Tobago 1868|TN Tunisia 216|" +
	"TR Türkiye 90|TM Turkmenistan 993|TC Turks & Caicos Islands 1649|TV Tuvalu 688|UG Uganda 256|" +
	"UA Ukraine 380|AE United Arab Emirates 971|GB United Kingdom 44|UY Uruguay 598|VI US Virgin Islands 1340|" +
	"UZ Uzbekistan 998|VU Vanuatu 678|VA Vatican City 379|VE Venezuela 58|VN Vietnam 84|" +
	"WF Wallis & Futuna 681|YE Yemen 967|ZM Zambia 260|ZW Zimbabwe 263";

const LISTED: readonly Country[] = TABLE.split("|").map((row) => {
	const parts = row.split(" ");
	return {
		iso: parts[0] ?? "",
		name: parts.slice(1, -1).join(" "),
		dial: parts[parts.length - 1] ?? "",
	};
});

/** Every country, A to Z. */
export const COUNTRIES: readonly Country[] = [...LISTED].sort((a, b) =>
	a.name.localeCompare(b.name, "en"),
);

const BY_ISO = new Map(LISTED.map((country) => [country.iso, country]));

/** A country by its code; India's for one that isn't known. */
export function countryOf(iso: string): Country {
	const country = BY_ISO.get(iso) ?? BY_ISO.get(DEFAULT_COUNTRY);
	if (!country) throw new Error("The default country is not listed");
	return country;
}

/**
 * The country a number with a + belongs to, by the longest code it starts
 * with, so +1 876 is Jamaica and not the US; null for none. `preferred`
 * wins when it shares that code: a +1 number stays Canada once chosen.
 */
export function countryOfNumber(
	value: string,
	preferred?: string,
): Country | null {
	const compact = compactOf(value);
	if (!compact.startsWith("+")) return null;
	const digits = compact.slice(1);
	let found: Country | null = null;
	for (const country of LISTED)
		if (
			digits.startsWith(country.dial) &&
			(!found || country.dial.length > found.dial.length)
		)
			found = country;
	if (!found) return null;
	const chosen = preferred ? BY_ISO.get(preferred) : undefined;
	return chosen && chosen.dial === found.dial ? chosen : found;
}

/**
 * What the picker and the box beside it add up to: "+91 9876543210". A whole
 * number pasted into the box, with its own code, is kept as it is. Empty
 * when nothing is typed, so a chosen country alone is not an answer.
 */
export function joinPhone(iso: string, typed: string): string {
	// Only the start: a space at the end is one being typed mid-number.
	const text = typed.trimStart();
	if (!text) return "";
	if (/^(\+|00)/.test(text.replace(/[\s(]/g, "")))
		return text.replace(/^[\s(]*00/, "+");
	const { dial } = countryOf(iso);
	const national = DROPS_ZERO.has(dial) ? text.replace(/^0+(?=.)/, "") : text;
	return `+${dial} ${national}`;
}

/** The two halves again, from a stored or half-typed value. */
export function splitPhone(
	value: string,
	preferred: string = DEFAULT_COUNTRY,
): { iso: string; typed: string } {
	const text = value.trimStart();
	const country = countryOfNumber(text, preferred);
	if (!country) return { iso: countryOf(preferred).iso, typed: text };
	// Past the code, whatever spaces were typed inside it.
	let seen = 0;
	let at = 0;
	while (at < text.length && seen < country.dial.length) {
		if (/[0-9]/.test(text[at] ?? "")) seen++;
		at++;
	}
	return { iso: country.iso, typed: text.slice(at).replace(/^[\s)-]+/, "") };
}
