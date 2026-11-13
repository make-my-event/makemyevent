import styles from "./brand.module.css";

/**
 * The makemyevent logo: symbol plus wordmark. The wordmark has a light and a
 * dark drawing; CSS shows the one that matches the theme.
 */
export function Brand({ className }: { className?: string | undefined }) {
	return (
		<span className={`${styles.brand}${className ? ` ${className}` : ""}`}>
			{/* biome-ignore lint/performance/noImgElement: small static SVGs, no optimisation to gain */}
			<img
				className={styles.symbol}
				src="/icon.svg"
				alt=""
				width={28}
				height={28}
			/>
			{/* biome-ignore lint/performance/noImgElement: small static SVGs, no optimisation to gain */}
			<img
				className={`${styles.wordmark} ${styles.onLight}`}
				src="/makemyevent-wordmark-light.svg"
				alt="makemyevent"
				width={144}
				height={18}
			/>
			{/* biome-ignore lint/performance/noImgElement: small static SVGs, no optimisation to gain */}
			<img
				className={`${styles.wordmark} ${styles.onDark}`}
				src="/makemyevent-wordmark-dark.svg"
				alt="makemyevent"
				width={144}
				height={18}
			/>
		</span>
	);
}
