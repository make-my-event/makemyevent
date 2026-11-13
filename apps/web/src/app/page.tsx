export default function HomePage() {
	return (
		<main
			style={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "#ffffff",
				color: "#111111",
				fontFamily: "Arial, Helvetica, sans-serif",
			}}
		>
			{/* biome-ignore lint/performance/noImgElement: a static SVG; the image
          optimiser has nothing to do for it. */}
			<img
				src="/makemyevent-wordmark-light.svg"
				alt="MakemyEvent"
				style={{
					display: "block",
					maxWidth: "min(85vw, 560px)",
					height: "auto",
				}}
			/>
		</main>
	);
}
