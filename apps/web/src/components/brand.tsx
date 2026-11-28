import styles from "./brand.module.css";

/**
 * The MakeMyEvent logo: symbol plus wordmark.
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
 *
 * `tight` drops the wordmark on the narrowest phones, for a caller whose row
 * needs the width more than the mark needs its full form. The symbol alone is
 * still the mark, and the name is still read aloud either way.
 */
export function Brand({
	className,
	tight = false,
}: {
	className?: string | undefined;
	tight?: boolean;
}) {
	return (
		<span
			className={`${styles.brand}${tight ? ` ${styles.tight}` : ""}${className ? ` ${className}` : ""}`}
		>
			<span className={styles.symbol} />
			<span className={`${styles.wordmark} ${styles.onLight}`} />
			<span className={`${styles.wordmark} ${styles.onDark}`} />
			<span className={styles.srOnly}>MakeMyEvent</span>
		</span>
	);
}
