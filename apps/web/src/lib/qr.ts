import "server-only";
import type { PassCode } from "@makemyevent/core";
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

/**
 * For a designed pass: the dark modules as one SVG path in module units, no
 * quiet zone (the pass draws the tile and the margin). Same error
 * correction as above.
 */
export function qrModules(text: string): PassCode {
	const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
	const n = qr.modules.size;
	const cells: string[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (qr.modules.get(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
	return { modules: n, path: cells.join("") };
}
