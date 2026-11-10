import type { JSX } from "react";
import { THEME_INIT_SCRIPT } from "./theme-constants";

export interface ThemeScriptProps {
	/**
	 * Per-request CSP nonce (the `x-nonce` header set in src/proxy.ts). The
	 * policy is nonce + 'strict-dynamic', so an inline script without it is
	 * blocked once the CSP is enforced.
	 */
	nonce?: string;
}

/**
 * Inline, render-blocking script for the root layout's <head>. It applies the
 * saved theme before the browser paints. The script body is a static string
 * built from constants, never from user input.
 */
export function ThemeScript({ nonce }: ThemeScriptProps): JSX.Element {
	return (
		<script
			nonce={nonce}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: static constant, required to run before hydration
			dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
		/>
	);
}
