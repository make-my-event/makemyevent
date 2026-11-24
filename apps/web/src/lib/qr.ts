import "server-only";
import QRCode from "qrcode";

/**
 * QR codes, drawn the same way everywhere. They are printed, scanned off
 * screens in the dark and photographed at angles, so they are always dark
 * on light, never themed: ink on surface from design-spec.md, at full
 * strength in both themes. Medium error correction, a two-module quiet zone.
 */
const DARK = "#1b1a18";
const LIGHT = "#fefdfc";

const OPTIONS = {
	errorCorrectionLevel: "M",
	margin: 2,
	color: { dark: DARK, light: LIGHT },
} as const;

/** For a page: scalable, crisp at any size. */
export function qrSvg(text: string): Promise<string> {
	return QRCode.toString(text, { ...OPTIONS, type: "svg" });
}

/** For an email, where SVG isn't shown: a PNG, `width` pixels square. */
export function qrPng(text: string, width = 480): Promise<Buffer> {
	return QRCode.toBuffer(text, { ...OPTIONS, type: "png", width });
}
