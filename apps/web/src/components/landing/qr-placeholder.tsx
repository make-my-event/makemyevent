import type { JSX } from "react";

const GRID = 21;

function isFinderModule(row: number, col: number): boolean {
	if (row < 0 || row > 6 || col < 0 || col > 6) return false;
	return (
		row === 0 ||
		row === 6 ||
		col === 0 ||
		col === 6 ||
		(row >= 2 && row <= 4 && col >= 2 && col <= 4)
	);
}

/**
 * SVG path for a 21x21 QR-like pattern: three finder squares plus seeded
 * pseudo-random modules. Deterministic for a given seed, so server and
 * client render the same markup. It is not a scannable code.
 */
export function qrPlaceholderPath(seed: number): string {
	let state = seed >>> 0;
	function next(): number {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return (state >>> 24) % 100;
	}

	let d = "";
	for (let y = 0; y < GRID; y++) {
		for (let x = 0; x < GRID; x++) {
			let on: boolean;
			if (y < 8 && x < 8) on = isFinderModule(y, x);
			else if (y < 8 && x > GRID - 9) on = isFinderModule(y, x - (GRID - 7));
			else if (y > GRID - 9 && x < 8) on = isFinderModule(y - (GRID - 7), x);
			else on = next() < 48;
			if (on) d += `M${x} ${y}h1v1h-1z`;
		}
	}
	return d;
}

export interface QrPlaceholderProps {
	/** Different seeds give different patterns. */
	seed: number;
	className?: string;
}

/** Decorative stand-in for a QR code. Hidden from assistive technology. */
export function QrPlaceholder({
	seed,
	className,
}: QrPlaceholderProps): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox="-2 -2 25 25"
			shapeRendering="crispEdges"
			className={className}
		>
			<path fill="currentColor" d={qrPlaceholderPath(seed)} />
		</svg>
	);
}
