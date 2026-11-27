"use client";

import {
	repeatGuard,
	SCAN_WORDS,
	type ScanKind,
	scanKind,
} from "@makemyevent/core";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import { undoCheckIn } from "../guests/actions";
import {
	type DoorCount,
	doorCount,
	type ScanResult,
	scanCode,
	scanPass,
} from "./actions";
import styles from "./scanner.module.css";

/** Not in TypeScript's DOM library yet: the browser's own QR reader. */
type Detector = {
	detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type DetectorClass = {
	new (options: { formats: string[] }): Detector;
	getSupportedFormats: () => Promise<string[]>;
};
type Reader = (video: HTMLVideoElement) => Promise<string | null>;

/** How long each answer stays before scanning carries on. */
const HOLD_MS: Record<ScanKind, number> = {
	admit: 1400,
	again: 2400,
	stop: 3200,
};
/** A code held up again within this is the same guest, not a new scan. */
const REPEAT_MS = 5000;
const FRAME_MS = 120;
const COUNT_MS = 5000;
const SOUND_KEY = "scanner-sound";

type Shown = { result: Extract<ScanResult, { ok: true }>; at: number };
type Last = { id: string; name: string; at: number };
type Phase =
	| "idle"
	| "starting"
	| "scanning"
	| "denied"
	| "nocamera"
	| "insecure";

// ---- Sounds -----------------------------------------------------------------

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
function playFor(ctx: AudioContext, kind: ScanKind) {
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

const VIBRATE: Record<ScanKind, number[]> = {
	admit: [60],
	again: [60, 80, 60],
	stop: [320],
};

// ---- Reading codes ------------------------------------------------------------

/** The browser's own reader where it has one; jsQR, loaded now, elsewhere. */
async function makeReader(): Promise<Reader> {
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

function clock(ms: number) {
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(ms);
}

function ago(iso: string, now: number) {
	const mins = Math.round((now - new Date(iso).getTime()) / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins} min ago`;
	const hours = Math.round(mins / 60);
	return `${hours} h ago`;
}

// ---- The scanner ------------------------------------------------------------------

/**
 * The door scanner. One tap starts the camera and unlocks sound (phones
 * allow neither until someone taps). Then it reads codes nonstop: each read
 * pauses it, the server answers, the screen and a sound say which of three
 * kinds it is, and after a moment it carries on by itself. It follows the
 * site's light or dark theme, like every other page.
 *
 *   ┌ Summit 2026, Day 2                 312 / 400 in ┐
 *   │            [ the camera, a frame to aim at ]    │
 *   │ Last: Asha Rao, 10:42                    Undo   │
 *   └ [Torch]       [Sound on]        [Type code]     ┘
 */
export function Scanner({
	eventId,
	eventTitle,
	dayLabel,
	initialCount,
}: {
	eventId: string;
	eventTitle: string;
	dayLabel: string | null;
	initialCount: DoorCount | null;
}) {
	const id = useId();
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const readerRef = useRef<Reader | null>(null);
	const audioRef = useRef<AudioContext | null>(null);
	const lockRef = useRef<WakeLockSentinel | null>(null);
	const busyRef = useRef(false);
	const guardRef = useRef(repeatGuard(REPEAT_MS));
	const holdRef = useRef<number | undefined>(undefined);

	const [phase, setPhase] = useState<Phase>("idle");
	const [shown, setShown] = useState<Shown | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [count, setCount] = useState<DoorCount | null>(initialCount);
	const [last, setLast] = useState<Last | null>(null);
	const [sound, setSound] = useState(true);
	const [torch, setTorch] = useState<boolean | null>(null);
	const [online, setOnline] = useState(true);
	const [typing, setTyping] = useState(false);
	const [undoing, setUndoing] = useState(false);
	const [, tick] = useState(0);

	const soundRef = useRef(sound);
	soundRef.current = sound;

	// Sound on or off is this phone's own choice, remembered here.
	useEffect(() => {
		try {
			if (localStorage.getItem(SOUND_KEY) === "off") setSound(false);
		} catch {
			// Private mode: sound stays on.
		}
	}, []);

	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);

	const refreshCount = useCallback(async () => {
		if (document.visibilityState !== "visible" || !navigator.onLine) return;
		try {
			const next = await doorCount(eventId);
			if (next) setCount(next);
		} catch {
			// Kept as it was; the next one tries again.
		}
	}, [eventId]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			void refreshCount();
			tick((n) => n + 1); // "11 min ago" stays true
		}, COUNT_MS);
		return () => window.clearInterval(timer);
	}, [refreshCount]);

	const stopCamera = useCallback(() => {
		for (const track of streamRef.current?.getTracks() ?? []) track.stop();
		streamRef.current = null;
		void lockRef.current?.release().catch(() => {});
		lockRef.current = null;
	}, []);

	useEffect(() => stopCamera, [stopCamera]);

	const keepAwake = useCallback(async () => {
		try {
			lockRef.current = await navigator.wakeLock?.request("screen");
		} catch {
			// Not offered here: the screen may dim, scanning still works.
		}
	}, []);

	/** Says the answer: on screen, aloud for screen readers, a sound, a buzz. */
	const answer = useCallback(
		(result: ScanResult) => {
			if (!result.ok) {
				setProblem(result.message);
				const ctx = audioRef.current;
				if (ctx && soundRef.current) playFor(ctx, "stop");
				window.clearTimeout(holdRef.current);
				holdRef.current = window.setTimeout(() => {
					setProblem(null);
					busyRef.current = false;
				}, HOLD_MS.stop);
				return;
			}
			const kind = scanKind(result.outcome);
			setShown({ result, at: Date.now() });
			const ctx = audioRef.current;
			if (ctx && soundRef.current) playFor(ctx, kind);
			navigator.vibrate?.(VIBRATE[kind]);
			if (result.outcome === "admitted" && result.guest)
				setLast({
					id: result.guest.id,
					name: result.guest.name,
					// The server's time, so it agrees with "Already in, by".
					at: result.at ? new Date(result.at).getTime() : Date.now(),
				});
			if (kind !== "stop") void refreshCount();
			window.clearTimeout(holdRef.current);
			holdRef.current = window.setTimeout(() => {
				setShown(null);
				busyRef.current = false;
			}, HOLD_MS[kind]);
		},
		[refreshCount],
	);

	const check = useCallback(
		async (send: () => Promise<ScanResult>) => {
			busyRef.current = true;
			try {
				answer(await send());
			} catch {
				answer({
					ok: false,
					message: navigator.onLine
						? "That scan couldn't be checked. Try again."
						: "No connection: scans can't be checked.",
				});
			}
		},
		[answer],
	);

	// The reading loop: a frame every FRAME_MS while scanning and not busy.
	useEffect(() => {
		if (phase !== "scanning") return;
		let stopped = false;
		let timer: number | undefined;
		const step = async () => {
			if (stopped) return;
			const video = videoRef.current;
			const read = readerRef.current;
			if (
				video &&
				read &&
				!busyRef.current &&
				navigator.onLine &&
				document.visibilityState === "visible" &&
				video.readyState >= 2
			) {
				try {
					const text = await read(video);
					if (text && guardRef.current(text, Date.now()))
						await check(() => scanPass(eventId, text));
				} catch {
					// A frame that couldn't be read: the next one will be.
				}
			}
			timer = window.setTimeout(step, FRAME_MS);
		};
		void step();
		return () => {
			stopped = true;
			window.clearTimeout(timer);
		};
	}, [phase, eventId, check]);

	// Hidden: the camera stops, so a phone in a pocket isn't filming.
	// Back: it starts again, and the screen is kept awake again.
	useEffect(() => {
		if (phase !== "scanning") return;
		const onVisibility = () => {
			if (document.visibilityState === "visible") void start();
			else stopCamera();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	});

	async function start() {
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			setPhase("insecure");
			return;
		}
		setPhase("starting");
		// Made on this tap: phones only allow sound that a tap started.
		if (!audioRef.current) {
			try {
				audioRef.current = new AudioContext();
			} catch {
				// No sound on this browser; the screen still says it all.
			}
		}
		void audioRef.current?.resume();
		try {
			stopCamera();
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: "environment" },
					width: { ideal: 1280 },
					height: { ideal: 720 },
				},
				audio: false,
			});
			streamRef.current = stream;
			const video = videoRef.current;
			if (video) {
				video.srcObject = stream;
				await video.play();
			}
			const track = stream.getVideoTracks()[0];
			const caps = track?.getCapabilities?.() as
				| (MediaTrackCapabilities & { torch?: boolean })
				| undefined;
			setTorch(caps?.torch ? false : null);
			readerRef.current ??= await makeReader();
			await keepAwake();
			setPhase("scanning");
		} catch (error) {
			const name = error instanceof DOMException ? error.name : "";
			setPhase(
				name === "NotAllowedError" || name === "SecurityError"
					? "denied"
					: "nocamera",
			);
		}
	}

	async function flipTorch() {
		const track = streamRef.current?.getVideoTracks()[0];
		if (!track || torch === null) return;
		try {
			await track.applyConstraints({
				advanced: [{ torch: !torch } as MediaTrackConstraintSet],
			});
			setTorch(!torch);
		} catch {
			setTorch(null);
		}
	}

	function flipSound() {
		const next = !sound;
		setSound(next);
		try {
			localStorage.setItem(SOUND_KEY, next ? "on" : "off");
		} catch {
			// Not remembered; still applies now.
		}
	}

	async function undo() {
		if (!last) return;
		setUndoing(true);
		const result = await undoCheckIn(eventId, last.id);
		setUndoing(false);
		if (result.ok) {
			setLast(null);
			void refreshCount();
		} else setProblem(result.message);
	}

	function dismiss() {
		window.clearTimeout(holdRef.current);
		setShown(null);
		setProblem(null);
		busyRef.current = false;
	}

	const kind = shown ? scanKind(shown.result.outcome) : problem ? "stop" : null;
	const words = shown ? SCAN_WORDS[shown.result.outcome] : null;
	const guest = shown?.result.guest;
	const earlier = shown?.result.earlier;

	return (
		<div className={styles.scanner}>
			<div className={styles.top}>
				<p className={styles.where}>
					<span className={styles.event}>{eventTitle}</span>
					{dayLabel ? <span className={styles.day}>{dayLabel}</span> : null}
				</p>
				{count ? (
					<p className={styles.count}>
						{count.in} / {count.of} in
					</p>
				) : null}
			</div>

			{online ? null : (
				<p className={styles.offline} role="alert">
					No connection: scans can't be checked. Scanning carries on when it's
					back.
				</p>
			)}

			<div className={styles.stage}>
				<video
					ref={videoRef}
					className={styles.video}
					playsInline
					muted
					// The camera's picture: what it reads is said in words.
					tabIndex={-1}
					data-on={phase === "scanning" || undefined}
				/>
				{phase === "scanning" ? (
					<div className={styles.frame} aria-hidden="true" />
				) : null}

				{phase !== "scanning" ? (
					<div className={styles.gate}>
						{phase === "idle" || phase === "starting" ? (
							<>
								<p className={styles.gateTitle}>Ready at the door</p>
								<p className={styles.gateText}>
									Point the camera at a pass. It reads one after another; you
									don't need to tap between guests.
								</p>
								<button
									type="button"
									className={styles.start}
									onClick={() => void start()}
									disabled={phase === "starting"}
									aria-busy={phase === "starting" || undefined}
								>
									{phase === "starting"
										? "Starting the camera…"
										: "Start scanning"}
								</button>
							</>
						) : (
							<>
								<p className={styles.gateTitle}>
									{phase === "denied"
										? "The camera is blocked"
										: phase === "insecure"
											? "The camera needs a secure page"
											: "No camera found"}
								</p>
								<p className={styles.gateText}>
									{phase === "denied"
										? "Allow the camera for this site in your browser's settings, then try again. You can still type ticket codes."
										: phase === "insecure"
											? "Open this page over https to use the camera. You can still type ticket codes."
											: "Use a phone or a laptop with a camera, or type ticket codes."}
								</p>
								<button
									type="button"
									className={styles.start}
									onClick={() => void start()}
								>
									Try again
								</button>
							</>
						)}
					</div>
				) : null}

				{kind ? (
					<button
						type="button"
						className={styles.result}
						data-kind={kind}
						onClick={dismiss}
						aria-label="Scan the next pass"
					>
						<span className={styles.mark}>{words?.title ?? "Not checked"}</span>
						{guest && kind !== "stop" ? (
							<span className={styles.name}>{guest.name}</span>
						) : null}
						{guest && kind !== "stop" ? (
							<span className={styles.sub}>{guest.ticket}</span>
						) : null}
						{earlier ? (
							<span className={styles.sub}>
								Scanned {clock(new Date(earlier.at).getTime())}
								{earlier.by ? ` by ${earlier.by}` : ""},{" "}
								{ago(earlier.at, Date.now())}
							</span>
						) : null}
						{kind === "stop" ? (
							<span className={styles.sub}>{problem ?? words?.detail}</span>
						) : null}
						<span className={styles.next}>Tap for the next guest</span>
					</button>
				) : null}
			</div>

			<p className={styles.srOnly} aria-live="assertive" id={`${id}said`}>
				{kind
					? [
							words?.title ?? "Not checked",
							guest?.name,
							kind === "stop" ? (problem ?? words?.detail) : "",
						]
							.filter(Boolean)
							.join(". ")
					: ""}
			</p>

			<div className={styles.lastRow}>
				{last ? (
					<>
						<p className={styles.last}>
							Last: {last.name}, {clock(last.at)}
						</p>
						<button
							type="button"
							className={styles.undo}
							onClick={() => void undo()}
							disabled={undoing}
							aria-busy={undoing || undefined}
						>
							{undoing ? "Undoing…" : "Undo"}
						</button>
					</>
				) : (
					<p className={styles.last}>No one let in from this phone yet.</p>
				)}
			</div>

			<div className={styles.tools}>
				<button
					type="button"
					className={styles.tool}
					aria-pressed={torch === true}
					disabled={torch === null}
					onClick={() => void flipTorch()}
				>
					{torch === null ? "No torch" : torch ? "Torch on" : "Torch"}
				</button>
				<button
					type="button"
					className={styles.tool}
					aria-pressed={sound}
					onClick={flipSound}
				>
					{sound ? "Sound on" : "Sound off"}
				</button>
				<button
					type="button"
					className={styles.tool}
					onClick={() => setTyping(true)}
				>
					Type code
				</button>
			</div>

			<TypeCode
				open={typing}
				onClose={() => setTyping(false)}
				onSubmit={async (code) => {
					// Typing unlocks sound too.
					if (!audioRef.current) {
						try {
							audioRef.current = new AudioContext();
						} catch {
							// No sound here.
						}
					}
					void audioRef.current?.resume();
					await check(() => scanCode(eventId, code));
				}}
			/>
		</div>
	);
}

/** A ticket code typed in, for a pass that won't scan. */
function TypeCode({
	open,
	onClose,
	onSubmit,
}: {
	open: boolean;
	onClose: () => void;
	onSubmit: (code: string) => Promise<void>;
}) {
	const ref = useModalDialog(open);
	const id = useId();
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<dialog
			ref={ref}
			className={styles.dialog}
			aria-labelledby={`${id}t`}
			onClose={ownClose(onClose)}
		>
			<form
				className={styles.dialogBody}
				onSubmit={async (e) => {
					e.preventDefault();
					if (!code.trim()) return;
					setBusy(true);
					await onSubmit(code);
					setBusy(false);
					setCode("");
					ref.current?.close();
				}}
			>
				<h3 className={styles.dialogTitle} id={`${id}t`}>
					Type a ticket code
				</h3>
				<label className={styles.label} htmlFor={`${id}c`}>
					Ticket code
				</label>
				<input
					id={`${id}c`}
					className={styles.input}
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder="MME-7K2Q-9F4B"
					autoCapitalize="characters"
					autoComplete="off"
					spellCheck={false}
					maxLength={20}
				/>
				<p className={styles.hint}>
					It's under the code on their pass and in their email.
				</p>
				<div className={styles.dialogActions}>
					<button
						type="button"
						className={styles.tool}
						onClick={() => ref.current?.close()}
					>
						Cancel
					</button>
					<button
						type="submit"
						className={styles.start}
						disabled={busy || !code.trim()}
						aria-busy={busy || undefined}
					>
						{busy ? "Checking…" : "Check in"}
					</button>
				</div>
			</form>
		</dialog>
	);
}
