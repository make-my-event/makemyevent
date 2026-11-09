import { z } from "zod";

/**
 * Zod schemas for user-supplied URLs that the web app renders as links or
 * images. `z.string().url()` alone is not enough: it accepts any parseable URL,
 * including `javascript:alert(1)` and `data:` URLs.
 *
 * Both schemas: trim; "" becomes null (field cleared); a value with no scheme
 * ("example.com/page") gets "https://" prepended, matching how the UI already
 * treats bare domains; anything that is not a valid URL with an allowed scheme
 * is rejected. Output is the normalised URL string.
 */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

function urlSchema(allowedProtocols: readonly string[], rejectMessage: string) {
	return z
		.string()
		.trim()
		.max(2048, "URL is too long.")
		.transform((value, ctx): string | null => {
			if (value === "") return null;
			const candidate = SCHEME_PREFIX.test(value) ? value : `https://${value}`;
			let url: URL;
			try {
				url = new URL(candidate);
			} catch {
				ctx.addIssue({ code: "custom", message: "Enter a valid URL." });
				return z.NEVER;
			}
			if (!allowedProtocols.includes(url.protocol) || url.hostname === "") {
				ctx.addIssue({ code: "custom", message: rejectMessage });
				return z.NEVER;
			}
			return url.toString();
		});
}

/** Links people click (websites, maps, meeting and recording links). */
export const linkUrl = urlSchema(
	["https:", "http:"],
	"Links must start with https:// or http://.",
);

/** Images loaded into pages (logos, banners, avatars): HTTPS only. */
export const imageUrl = urlSchema(
	["https:"],
	"Image links must start with https://.",
);
