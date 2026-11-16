import { accessSync, constants } from "node:fs";

/**
 * Where Chrome is. Lighthouse and axe both drive a real browser, and the
 * repository does not ship one: CI runners and developer machines already
 * have Chrome, and downloading a second copy per install costs more than it
 * buys. CHROME_PATH overrides, which is what CI sets when it needs to.
 */
const CANDIDATES = [
	process.env.CHROME_PATH,
	"/usr/bin/google-chrome",
	"/usr/bin/google-chrome-stable",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
	"/snap/bin/chromium",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function chromePath() {
	for (const candidate of CANDIDATES) {
		if (!candidate) continue;
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Try the next one.
		}
	}
	throw new Error(
		"No Chrome found. Install Google Chrome or Chromium, or set CHROME_PATH.",
	);
}
