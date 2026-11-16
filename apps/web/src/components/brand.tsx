import styles from "./brand.module.css";

/**
 * The makemyevent logo: symbol plus wordmark.
 *
 * The wordmark has a light and a dark drawing, and only the one that matches
 * the theme is fetched. A hidden `<img>` is still downloaded by every browser,
 * so the drawings are CSS backgrounds instead: a background on a
 * `display: none` element is never requested. The name is carried by real
 * text, hidden visually, rather than by an `alt` attribute.
 */
export function Brand({ className }: { className?: string | undefined }) {
	return (
		<span className={`${styles.brand}${className ? ` ${className}` : ""}`}>
			{/* biome-ignore lint/performance/noImgElement: small static SVG, no optimisation to gain */}
			<img
				className={styles.symbol}
				src="/icon.svg"
				alt=""
				width={28}
				height={28}
			/>
			<span className={`${styles.wordmark} ${styles.onLight}`} />
			<span className={`${styles.wordmark} ${styles.onDark}`} />
			<span className={styles.srOnly}>makemyevent</span>
		</span>
	);
}
