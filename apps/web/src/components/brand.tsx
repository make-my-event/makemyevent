import styles from "./brand.module.css";

/**
 * The makemyevent logo: symbol plus wordmark.
 *
 * The three drawings live in src/assets rather than public/, so the build
 * fingerprints them and they are served immutable for a year.
 * public/icon.svg stays where it is, on a stable path, for the favicon and
 * for crawlers; nothing on a page points at it.
 *
 * Only the wordmark the theme is using is fetched. A hidden `<img>` is still
 * downloaded by every browser, so all three drawings are CSS backgrounds
 * instead: a background on a `display: none` element is never requested. The
 * name is carried by real text, hidden visually, rather than by an `alt`.
 */
export function Brand({ className }: { className?: string | undefined }) {
	return (
		<span className={`${styles.brand}${className ? ` ${className}` : ""}`}>
			<span className={styles.symbol} />
			<span className={`${styles.wordmark} ${styles.onLight}`} />
			<span className={`${styles.wordmark} ${styles.onDark}`} />
			<span className={styles.srOnly}>makemyevent</span>
		</span>
	);
}
