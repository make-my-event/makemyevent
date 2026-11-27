import type { PassFonts } from "@makemyevent/core";

/**
 * The faces a pass is set in on our pages: the site's own, through its CSS
 * variables, so an inline pass matches the page around it.
 */
export const PAGE_PASS_FONTS: PassFonts = {
	display: "var(--font-display)",
	body: "var(--font-body)",
	mono: "var(--font-mono)",
};
