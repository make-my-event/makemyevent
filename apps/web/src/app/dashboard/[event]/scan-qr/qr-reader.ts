/** Not in TypeScript's DOM library yet: the browser's own QR reader. */
type Detector = {
	detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type DetectorClass = {
	new (options: { formats: string[] }): Detector;
	getSupportedFormats: () => Promise<string[]>;
};
export type Reader = (video: HTMLVideoElement) => Promise<string | null>;

/** The browser's own reader where it has one; jsQR, loaded now, elsewhere. */
export async function makeReader(): Promise<Reader> {
	const Native = (globalThis as { BarcodeDetector?: DetectorClass })
		.BarcodeDetector;
	if (Native) {
		try {
			if ((await Native.getSupportedFormats()).includes("qr_code")) {
				const detector = new Native({ formats: ["qr_code"] });
				return async (video) =>
					(await detector.detect(video))[0]?.rawValue ?? null;
			}
		} catch {
			// Fall through to jsQR.
		}
	}
	const { default: jsQR } = await import("jsqr");
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d", { willReadFrequently: true });
	return async (video) => {
		if (!context || !video.videoWidth) return null;
		// 640 wide is plenty for a pass held at arm's length, and quick.
		const scale = Math.min(1, 640 / video.videoWidth);
		canvas.width = Math.round(video.videoWidth * scale);
		canvas.height = Math.round(video.videoHeight * scale);
		context.drawImage(video, 0, 0, canvas.width, canvas.height);
		const image = context.getImageData(0, 0, canvas.width, canvas.height);
		return (
			jsQR(image.data, image.width, image.height, {
				inversionAttempts: "dontInvert",
			})?.data ?? null
		);
	};
}
