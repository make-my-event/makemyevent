import styles from "./page.module.css";

export default function HomePage() {
	return (
		<main className={styles.main}>
			{/* biome-ignore lint/performance/noImgElement: a static SVG; the image optimiser has nothing to do for it. */}
			<img
				className={`${styles.wordmark} ${styles.onLight}`}
				src="/makemyevent-wordmark-light.svg"
				alt="makemyevent"
				width={1196}
				height={150}
			/>
			{/* biome-ignore lint/performance/noImgElement: a static SVG; the image optimiser has nothing to do for it. */}
			<img
				className={`${styles.wordmark} ${styles.onDark}`}
				src="/makemyevent-wordmark-dark.svg"
				alt="makemyevent"
				width={1196}
				height={150}
			/>
		</main>
	);
}
