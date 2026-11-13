"use client";

import styles from "./theme-toggle.module.css";

const KEY = "makemyevent-theme";

/**
 * Switches between the light and dark themes and remembers the choice.
 *
 * The accessible name comes from the two spans below rather than an aria-label,
 * so it is already correct on the first paint: the theme class is set by the
 * script in the document head, and CSS hides whichever label does not apply.
 * A hidden (display: none) span takes no part in the accessible name.
 */
export function ThemeToggle() {
	function toggle() {
		const next = !document.documentElement.classList.contains("dark");
		document.documentElement.classList.toggle("dark", next);
		try {
			localStorage.setItem(KEY, next ? "dark" : "light");
		} catch {
			// Storage can be blocked. The choice then lasts for this page only.
		}
	}

	return (
		<button type="button" className={styles.button} onClick={toggle}>
			<span className={`${styles.srOnly} ${styles.onLight}`}>
				Switch to dark theme
			</span>
			<span className={`${styles.srOnly} ${styles.onDark}`}>
				Switch to light theme
			</span>
			<svg
				className={styles.moon}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
			</svg>
			<svg
				className={styles.sun}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="4" />
				<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
			</svg>
		</button>
	);
}
