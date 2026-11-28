import type { ScanKind } from "@makemyevent/core";

/**
 * The door's sounds and buzzes, one of each per kind of answer, made in the
 * browser: no files to load. Sound needs an AudioContext made on a tap.
 */

function tone(
	ctx: AudioContext,
	freq: number,
	start: number,
	length: number,
	type: OscillatorType,
	level: number,
) {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	const t = ctx.currentTime + start;
	// A short ramp each end, so it beeps rather than clicks.
	gain.gain.setValueAtTime(0, t);
	gain.gain.linearRampToValueAtTime(level, t + 0.01);
	gain.gain.setValueAtTime(level, t + length - 0.02);
	gain.gain.linearRampToValueAtTime(0, t + length);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t);
	osc.stop(t + length + 0.01);
}

/** Admit: a high rising pair. Already in: two even beeps. Stop: a low buzz. */
export function playFor(ctx: AudioContext, kind: ScanKind) {
	if (kind === "admit") {
		tone(ctx, 880, 0, 0.09, "sine", 0.3);
		tone(ctx, 1320, 0.1, 0.16, "sine", 0.3);
	} else if (kind === "again") {
		tone(ctx, 660, 0, 0.1, "triangle", 0.3);
		tone(ctx, 660, 0.18, 0.1, "triangle", 0.3);
	} else {
		tone(ctx, 196, 0, 0.5, "square", 0.12);
	}
}

export const VIBRATE: Record<ScanKind, number[]> = {
	admit: [60],
	again: [60, 80, 60],
	stop: [320],
};
