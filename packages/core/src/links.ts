/**
 * Social links: where guests can follow, message or find the host, shown at
 * the foot of the event page.
 *
 * A host types what they have to hand (a handle, a pasted link, an email
 * or a phone number) and each platform turns it into one address guests
 * can open. Stored as that address: https for the web, mailto: for email,
 * tel: for a phone. The database checks the same shapes.
 */

import { phoneDigits } from "./phone.ts";

export const LINK_KINDS = [
	"website",
	"instagram",
	"x",
	"linkedin",
	"facebook",
	"youtube",
	"whatsapp",
	"telegram",
	"discord",
	"github",
	"mastodon",
	"bluesky",
	"threads",
	"tiktok",
	"email",
	"phone",
	"other",
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

/** Enough for every platform a host uses; a footer, not a directory. */
export const LINK_LIMIT = 12;

/** Kinds a page has at most one of: a second Instagram is a mistake. */
const SINGLE: ReadonlySet<LinkKind> = new Set([
	"instagram",
	"x",
	"facebook",
	"youtube",
	"tiktok",
	"threads",
	"bluesky",
]);

export function isSingleKind(kind: LinkKind): boolean {
	return SINGLE.has(kind);
}

export function isLinkKind(value: unknown): value is LinkKind {
	return (
		typeof value === "string" &&
		(LINK_KINDS as readonly string[]).includes(value)
	);
}

type Platform = {
	label: string;
	/** What to type, as the input's placeholder. */
	placeholder: string;
	/** Hosts whose links belong to this platform. */
	hosts: readonly string[];
	/** A bare handle, if the platform has them: name to address. */
	handle?: { pattern: RegExp; url: (name: string) => string };
};

export const PLATFORMS: Record<LinkKind, Platform> = {
	website: {
		label: "Website",
		placeholder: "yourevent.com",
		hosts: [],
	},
	instagram: {
		label: "Instagram",
		placeholder: "@yourhandle",
		hosts: ["instagram.com", "instagr.am"],
		handle: {
			pattern: /^[A-Za-z0-9._]{1,30}$/,
			url: (name) => `https://instagram.com/${name}`,
		},
	},
	x: {
		label: "X",
		placeholder: "@yourhandle",
		hosts: ["x.com", "twitter.com"],
		handle: {
			pattern: /^[A-Za-z0-9_]{1,15}$/,
			url: (name) => `https://x.com/${name}`,
		},
	},
	linkedin: {
		label: "LinkedIn",
		placeholder: "linkedin.com/company/yours",
		hosts: ["linkedin.com", "lnkd.in"],
	},
	facebook: {
		label: "Facebook",
		placeholder: "facebook.com/yourpage",
		hosts: ["facebook.com", "fb.com", "fb.me"],
		handle: {
			pattern: /^[A-Za-z0-9.]{5,50}$/,
			url: (name) => `https://facebook.com/${name}`,
		},
	},
	youtube: {
		label: "YouTube",
		placeholder: "@yourchannel",
		hosts: ["youtube.com", "youtu.be"],
		handle: {
			pattern: /^[A-Za-z0-9._-]{3,30}$/,
			url: (name) => `https://youtube.com/@${name}`,
		},
	},
	whatsapp: {
		label: "WhatsApp",
		placeholder: "+91 98765 43210 or a group link",
		hosts: ["wa.me", "whatsapp.com", "chat.whatsapp.com"],
	},
	telegram: {
		label: "Telegram",
		placeholder: "@yourchannel",
		hosts: ["t.me", "telegram.me"],
		handle: {
			pattern: /^[A-Za-z0-9_]{5,32}$/,
			url: (name) => `https://t.me/${name}`,
		},
	},
	discord: {
		label: "Discord",
		placeholder: "discord.gg/invite",
		hosts: ["discord.gg", "discord.com"],
		handle: {
			// An invite code on its own.
			pattern: /^[A-Za-z0-9-]{2,32}$/,
			url: (code) => `https://discord.gg/${code}`,
		},
	},
	github: {
		label: "GitHub",
		placeholder: "yourname",
		hosts: ["github.com"],
		handle: {
			pattern: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/,
			url: (name) => `https://github.com/${name}`,
		},
	},
	mastodon: {
		label: "Mastodon",
		placeholder: "@you@server.social",
		// Any server: Mastodon has thousands.
		hosts: [],
	},
	bluesky: {
		label: "Bluesky",
		placeholder: "you.bsky.social",
		hosts: ["bsky.app"],
		handle: {
			// A handle is a domain name.
			pattern: /^(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/,
			url: (name) => `https://bsky.app/profile/${name}`,
		},
	},
	threads: {
		label: "Threads",
		placeholder: "@yourhandle",
		hosts: ["threads.com", "threads.net"],
		handle: {
			pattern: /^[A-Za-z0-9._]{1,30}$/,
			url: (name) => `https://www.threads.com/@${name}`,
		},
	},
	tiktok: {
		label: "TikTok",
		placeholder: "@yourhandle",
		hosts: ["tiktok.com"],
		handle: {
			pattern: /^[A-Za-z0-9._]{2,24}$/,
			url: (name) => `https://www.tiktok.com/@${name}`,
		},
	},
	email: {
		label: "Email",
		placeholder: "hello@yourevent.com",
		hosts: [],
	},
	phone: {
		label: "Phone",
		placeholder: "+91 98765 43210",
		hosts: [],
	},
	other: {
		label: "Link",
		placeholder: "https://…",
		hosts: [],
	},
};

const URL_MAX = 2048;
export const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/** A web address from what was typed, https only; a bare domain gets https. */
export function webUrl(raw: string): URL | null {
	const text = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.username || url.password) return null;
	// A name with a dot: "localhost" or "intranet" are not on the web.
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
	return url;
}

export function onHost(url: URL, hosts: readonly string[]): boolean {
	const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
	return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

export type LinkResult =
	| { ok: true; url: string }
	| { ok: false; message: string };

/**
 * What the host typed for a platform, as the address guests open. Errors
 * say what to type instead.
 */
export function normalizeLink(kind: LinkKind, input: string): LinkResult {
	const raw = input.trim();
	const platform = PLATFORMS[kind];
	if (!raw)
		return {
			ok: false,
			message: `Add your ${platform.label} or remove this row.`,
		};
	if (raw.length > URL_MAX)
		return { ok: false, message: "That is too long for a link." };

	if (kind === "email") {
		const address = raw.replace(/^mailto:/i, "");
		return EMAIL.test(address) && address.length <= 254
			? { ok: true, url: `mailto:${address}` }
			: {
					ok: false,
					message: "Use an email address, like hello@yourevent.com.",
				};
	}

	if (kind === "phone") {
		const digits = phoneDigits(raw.replace(/^tel:/i, ""));
		return digits
			? { ok: true, url: `tel:${digits}` }
			: {
					ok: false,
					message:
						"Enter a whole phone number. Outside India, add its country code, like +44 20 7946 0958.",
				};
	}

	if (kind === "whatsapp") {
		const digits = phoneDigits(raw);
		if (digits) return { ok: true, url: `https://wa.me/${digits.slice(1)}` };
	}

	if (kind === "mastodon") {
		// @name@server.social
		const handle =
			/^@?([A-Za-z0-9_]{1,30})@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63})$/.exec(raw);
		if (handle)
			return {
				ok: true,
				url: `https://${handle[2]?.toLowerCase()}/@${handle[1]}`,
			};
	}

	// A link to the platform, pasted whole (or without its https://).
	const url = webUrl(raw);
	const onPlatform =
		url !== null && platform.hosts.length > 0 && onHost(url, platform.hosts);

	// Otherwise a handle on its own, with or without its @.
	if (!onPlatform && platform.handle && !raw.includes("/")) {
		const name = raw.replace(/^@/, "");
		if (platform.handle.pattern.test(name))
			return { ok: true, url: platform.handle.url(name) };
	}

	if (!url)
		return {
			ok: false,
			message: platform.handle
				? `Use your ${platform.label} handle or its https:// link.`
				: "Use a web address, like yourevent.com.",
		};
	if (platform.hosts.length > 0 && !onPlatform)
		return { ok: false, message: `That link is not from ${platform.label}.` };
	// Fragments are for the page itself; a trailing slash means nothing.
	url.hash = "";
	const text = url.href.replace(/\/$/, "");
	return text.length <= URL_MAX
		? { ok: true, url: text }
		: { ok: false, message: "That is too long for a link." };
}

/**
 * The platform something pasted belongs to: its host, an email address or
 * a phone number. A web address on no known host is a website.
 */
export function detectKind(input: string): LinkKind | null {
	const raw = input.trim();
	if (!raw) return null;
	if (/^mailto:/i.test(raw) || EMAIL.test(raw)) return "email";
	if (/^tel:/i.test(raw) || phoneDigits(raw)) return "phone";
	if (
		/^@?[A-Za-z0-9_]{1,30}@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/.test(raw) &&
		raw.startsWith("@")
	)
		return "mastodon";
	const url = webUrl(raw);
	if (!url) return null;
	for (const kind of LINK_KINDS) {
		const { hosts } = PLATFORMS[kind];
		if (hosts.length > 0 && onHost(url, hosts)) return kind;
	}
	return "website";
}

/**
 * A stored address back as the host would type it: the handle for a handle
 * platform, the address for email, the number for a phone.
 */
export function editableLink(kind: LinkKind, url: string): string {
	if (kind === "email") return url.replace(/^mailto:/, "");
	if (kind === "phone") return url.replace(/^tel:/, "");
	if (kind === "whatsapp" && /^https:\/\/wa\.me\/[0-9]+$/.test(url))
		return `+${url.slice("https://wa.me/".length)}`;
	const handle = PLATFORMS[kind].handle;
	const name = /^https:\/\/[^/]+\/(?:profile\/)?@?([^/?#]+)$/.exec(url)?.[1];
	// Only when the address is exactly the handle's: anything longer is kept.
	if (handle && name && handle.url(name) === url)
		return kind === "bluesky" || kind === "discord" ? name : `@${name}`;
	return url.replace(/^https:\/\//, "");
}

/** "instagram.com/yourhandle": the address, short, for a preview line. */
export function shortLink(url: string): string {
	if (url.startsWith("mailto:")) return url.slice(7);
	if (url.startsWith("tel:")) return url.slice(4);
	return url.replace(/^https:\/\/(www\.)?/, "");
}

export type LinkEntry = { kind: LinkKind; url: string };

export type LinksCheck =
	| { ok: true; values: LinkEntry[] }
	| { ok: false; index: number | null; message: string };

/** The whole list, as sent from the form: every row turned into its address. */
export function checkLinks(input: unknown): LinksCheck {
	if (!Array.isArray(input))
		return { ok: false, index: null, message: "Check the social links." };
	if (input.length > LINK_LIMIT)
		return { ok: false, index: null, message: `Up to ${LINK_LIMIT} links.` };
	const values: LinkEntry[] = [];
	const seen = new Set<string>();
	for (const [index, row] of input.entries()) {
		const kind = (row as { kind?: unknown })?.kind;
		const value = (row as { value?: unknown })?.value;
		if (!isLinkKind(kind) || typeof value !== "string")
			return { ok: false, index, message: "Check the social links." };
		const result = normalizeLink(kind, value);
		if (!result.ok) return { ok: false, index, message: result.message };
		if (seen.has(result.url))
			return { ok: false, index, message: "This link is already in the list." };
		if (isSingleKind(kind) && values.some((v) => v.kind === kind))
			return {
				ok: false,
				index,
				message: `Only one ${PLATFORMS[kind].label} link.`,
			};
		seen.add(result.url);
		values.push({ kind, url: result.url });
	}
	return { ok: true, values };
}
