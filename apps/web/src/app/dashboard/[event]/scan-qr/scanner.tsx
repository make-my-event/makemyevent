"use client";

import {
	type FormField,
	repeatGuard,
	SCAN_WORDS,
	type ScanKind,
	scanKind,
} from "@makemyevent/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { undoCheckIn } from "../guests/actions";
import { GuestFormPanel } from "../guests/guest-form-panel";
import { sendPasses } from "../guests/passes";
import {
	checkInGuest,
	type DoorCount,
	type DoorGuest,
	doorCount,
	type ScanResult,
	scanCode,
	scanPass,
} from "./actions";
import { DoorGuests } from "./door-guests";
import { knownDoor, rememberDoor } from "./door-memory";
import {
	DoorPicker,
	type DoorSetup,
	DoorsPanel,
	type DoorState,
} from "./doors";
import { playFor, VIBRATE } from "./door-sound";
import { ago, clock } from "./door-time";
import { makeReader, type Reader } from "./qr-reader";
import styles from "./scanner.module.css";
import { TypeCode } from "./type-code";

/** How long each answer holds the camera before it reads again. */
const HOLD_MS: Record<ScanKind, number> = {
	admit: 1400,
	again: 2400,
	stop: 3200,
};
/** A code held up again within this is the same guest, not a new scan. */
const REPEAT_MS = 5000;
const FRAME_MS = 120;
const COUNT_MS = 5000;
const KEYS = { sound: "scanner-sound", auto: "scanner-auto" };

type Answer =
	| { kind: ScanKind; result: Extract<ScanResult, { ok: true }> }
	| { kind: "stop"; message: string }
	| { kind: "note"; message: string };
type Phase =
	| "idle"
	| "starting"
	| "scanning"
	| "denied"
	| "nocamera"
	| "insecure";
type Mode = "scan" | "type";
type WalkIn = {
	fields: FormField[];
	tickets: { id: string; name: string }[];
	emailReady: boolean;
};

function stored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function store(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Not remembered on this phone; still applies now.
	}
}

/**
 * The door. The answer to each scan is a banner over the scanner (and a
 * sound and a buzz); below, the guest list. Scanner and Type code switch
 * with S and T (or /); Esc clears the answer.
 *
 *   [Scanner | Type code]         [Main gate] [Doors]   8 / 12 in
 *   ┌ ● Admitted: Asha Rao, General  10:42, Main gate  Undo  × ┐
 *   ┌ camera, brackets, scan line ─┐  Scanner   Auto-advance ●
 *   │       [Flip] [Torch] [Stop] │  Point at a pass…   Sound on
 *   ┌ Guests 12                                      + Walk-in ┐
 *   │ [search]  All · Checked in · Not yet                      │
 */
export function Scanner({
	eventId,
	dayLabel,
	initialCount,
	doors,
	doorSetup,
	walkIn,
}: {
	eventId: string;
	dayLabel: string | null;
	initialCount: DoorCount | null;
	/** The event's doors, and this person's if they're held to one. */
	doors: DoorState;
	/** For those who manage the event: who is held to which door. */
	doorSetup: DoorSetup | null;
	walkIn: WalkIn | null;
}) {
	const id = useId();
	const router = useRouter();
	const videoRef = useRef<HTMLVideoElement>(null);
	const typeRef = useRef<HTMLInputElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const readerRef = useRef<Reader | null>(null);
	const audioRef = useRef<AudioContext | null>(null);
	const lockRef = useRef<WakeLockSentinel | null>(null);
	const busyRef = useRef(false);
	const guardRef = useRef(repeatGuard(REPEAT_MS));
	const holdRef = useRef<number | undefined>(undefined);

	const [mode, setMode] = useState<Mode>("scan");
	const [phase, setPhase] = useState<Phase>("idle");
	const [facing, setFacing] = useState<"environment" | "user">("environment");
	const [answer, setAnswer] = useState<Answer | null>(null);
	const [count, setCount] = useState<DoorCount | null>(initialCount);
	const [sound, setSound] = useState(true);
	const [auto, setAuto] = useState(true);
	const [doorId, setDoorId] = useState<string | null>(
		doors.assigned?.id ?? null,
	);
	const [picking, setPicking] = useState<"start" | "change" | null>(null);
	const [setting, setSetting] = useState(false);
	const [torch, setTorch] = useState<boolean | null>(null);
	const [online, setOnline] = useState(true);
	const [version, setVersion] = useState(0);
	const [adding, setAdding] = useState(false);
	const [undoing, setUndoing] = useState(false);
	const [, tick] = useState(0);

	const soundRef = useRef(sound);
	soundRef.current = sound;
	const autoRef = useRef(auto);
	autoRef.current = auto;
	// With doors on: the assigned door, else the one picked on this phone
	// (if it's still open). Off: none.
	const door = !doors.enabled
		? null
		: (doors.assigned ?? doors.list.find((d) => d.id === doorId) ?? null);
	const doorRef = useRef<string | null>(door?.id ?? null);
	doorRef.current = door?.id ?? null;

	// This phone's own choices, remembered on it.
	useEffect(() => {
		if (stored(KEYS.sound) === "off") setSound(false);
		if (stored(KEYS.auto) === "off") setAuto(false);
	}, []);

	// The door this phone remembers, and what the Guests page will use.
	useEffect(() => {
		if (!doors.enabled) {
			rememberDoor(eventId, null);
			return;
		}
		if (doors.assigned) {
			rememberDoor(eventId, doors.assigned.id);
			setDoorId(doors.assigned.id);
			return;
		}
		const known = knownDoor(eventId);
		if (known && doors.list.some((d) => d.id === known)) setDoorId(known);
		else rememberDoor(eventId, null);
	}, [eventId, doors]);

	/** With doors on and none known yet, the door comes first. */
	function needsDoor(): boolean {
		if (!doors.enabled || doorRef.current) return false;
		setPicking("change");
		setAnswer({
			kind: "note",
			message: "Pick your door first, then try again.",
		});
		return true;
	}

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

	/** Sound is allowed only from a tap: made (or woken) on one. */
	function wakeSound() {
		if (!audioRef.current) {
			try {
				audioRef.current = new AudioContext();
			} catch {
				// No sound on this browser; the banner still says it all.
			}
		}
		void audioRef.current?.resume();
	}

	/** Says the answer: banner, aloud for screen readers, a sound, a buzz. */
	const say = useCallback(
		(result: ScanResult) => {
			const kind: ScanKind = result.ok ? scanKind(result.outcome) : "stop";
			setAnswer(
				result.ok
					? { kind, result }
					: { kind: "stop", message: result.message },
			);
			const ctx = audioRef.current;
			if (ctx && soundRef.current) playFor(ctx, kind);
			navigator.vibrate?.(VIBRATE[kind]);
			if (result.ok && result.outcome === "admitted") {
				setVersion((v) => v + 1);
				void refreshCount();
			}
			// The camera waits: a moment with auto-advance, else for a tap.
			window.clearTimeout(holdRef.current);
			if (autoRef.current)
				holdRef.current = window.setTimeout(() => {
					busyRef.current = false;
				}, HOLD_MS[kind]);
		},
		[refreshCount],
	);

	const check = useCallback(
		async (send: () => Promise<ScanResult>) => {
			busyRef.current = true;
			try {
				say(await send());
			} catch {
				say({
					ok: false,
					message: navigator.onLine
						? "That couldn't be checked. Try again."
						: "No connection: it can't be checked until it's back.",
				});
			}
		},
		[say],
	);

	function dismiss() {
		window.clearTimeout(holdRef.current);
		setAnswer(null);
		busyRef.current = false;
	}

	// The reading loop: a frame every FRAME_MS while scanning and not busy.
	useEffect(() => {
		if (phase !== "scanning" || mode !== "scan") return;
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
						await check(() => scanPass(eventId, text, doorRef.current));
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
	}, [phase, mode, eventId, check]);

	async function start(side = facing) {
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			setPhase("insecure");
			return;
		}
		setPhase("starting");
		wakeSound();
		try {
			stopCamera();
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: side },
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
			try {
				lockRef.current = await navigator.wakeLock?.request("screen");
			} catch {
				// The screen may dim; scanning still works.
			}
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

	function stop() {
		stopCamera();
		setTorch(null);
		setPhase("idle");
	}

	// Hidden: the camera stops, so a phone in a pocket isn't filming.
	useEffect(() => {
		if (phase !== "scanning") return;
		const onHide = () => {
			if (document.visibilityState === "hidden") stop();
		};
		document.addEventListener("visibilitychange", onHide);
		return () => document.removeEventListener("visibilitychange", onHide);
	});

	async function flip() {
		const next = facing === "environment" ? "user" : "environment";
		setFacing(next);
		await start(next);
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

	function switchMode(next: Mode) {
		setMode(next);
		if (next === "type") {
			wakeSound();
			requestAnimationFrame(() => typeRef.current?.focus());
		}
	}

	// S: Scanner. T or /: Type code. Esc: clear the answer.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (answer) dismiss();
				return;
			}
			const target = e.target as HTMLElement | null;
			if (
				e.metaKey ||
				e.ctrlKey ||
				e.altKey ||
				target?.closest("input, textarea, select, [contenteditable], dialog")
			)
				return;
			if (e.key === "s" || e.key === "S") switchMode("scan");
			else if (e.key === "t" || e.key === "T" || e.key === "/") {
				e.preventDefault();
				switchMode("type");
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	async function undo(guestId: string, name: string) {
		setUndoing(true);
		const result = await undoCheckIn(eventId, guestId);
		setUndoing(false);
		if (result.ok) {
			setAnswer({ kind: "note", message: `Check-in undone for ${name}.` });
			setVersion((v) => v + 1);
			void refreshCount();
		} else setAnswer({ kind: "stop", message: result.message });
	}

	const shown = answer && "result" in answer ? answer.result : null;
	const words = shown ? SCAN_WORDS[shown.outcome] : null;
	const guest = shown?.guest;
	const spoken = answer
		? "message" in answer
			? answer.message
			: [words?.title, guest?.name, answer.kind === "stop" ? words?.detail : ""]
					.filter(Boolean)
					.join(". ")
		: "";

	return (
		<div className={styles.door}>
			<div className={styles.bar}>
				<fieldset className={styles.modes}>
					<legend className={styles.srOnly}>Check in by</legend>
					{(
						[
							["scan", "Scanner", "S"],
							["type", "Type code", "T"],
						] as const
					).map(([value, label, key]) => (
						<label key={value} className={styles.mode}>
							<input
								type="radio"
								name={`${id}m`}
								className={styles.srOnly}
								checked={mode === value}
								onChange={() => switchMode(value)}
							/>
							{label}
							<kbd className={styles.kbd}>{key}</kbd>
						</label>
					))}
				</fieldset>
				<div className={styles.barEnd}>
					{doors.enabled ? (
						doors.assigned ? (
							<span className={styles.gate} title="Assigned by an organizer">
								{doors.assigned.name}, assigned
							</span>
						) : (
							<button
								type="button"
								className={styles.gate}
								onClick={() => setPicking("change")}
								aria-label={
									door ? `Door: ${door.name}. Change` : "Pick your door"
								}
							>
								{door?.name ?? "Pick your door"}
							</button>
						)
					) : null}
					{doorSetup ? (
						<button
							type="button"
							className={styles.gate}
							onClick={() => setSetting(true)}
						>
							Doors
						</button>
					) : null}
					{count ? (
						<p className={styles.count}>
							{count.in} / {count.of} in
							{dayLabel ? (
								<span className={styles.meta}> {dayLabel}</span>
							) : null}
						</p>
					) : null}
				</div>
			</div>

			{online ? null : (
				<p className={styles.offline} role="alert">
					No connection: scans can't be checked. Scanning carries on when it's
					back.
				</p>
			)}

			{answer ? (
				<div className={styles.banner} data-kind={answer.kind}>
					<span className={styles.bannerDot} aria-hidden="true" />
					<div className={styles.bannerText}>
						{"message" in answer ? (
							<p className={styles.bannerTitle}>{answer.message}</p>
						) : (
							<>
								<p className={styles.bannerTitle}>
									{words?.title}
									{guest ? `: ${guest.name}` : ""}
									{guest ? (
										<span className={styles.bannerTicket}> {guest.ticket}</span>
									) : null}
								</p>
								<p className={styles.bannerMeta}>
									{answer.kind === "stop"
										? words?.detail
										: shown?.earlier
											? `In at ${clock(new Date(shown.earlier.at).getTime())}${shown.earlier.by ? ` by ${shown.earlier.by}` : ""}${shown.earlier.door ? ` at ${shown.earlier.door}` : ""}, ${ago(shown.earlier.at, Date.now())}`
											: [
													shown?.at
														? clock(new Date(shown.at).getTime())
														: null,
													shown?.door ?? null,
													guest?.code ?? null,
												]
													.filter(Boolean)
													.join(", ")}
								</p>
							</>
						)}
					</div>
					{shown?.outcome === "admitted" && guest ? (
						<button
							type="button"
							className={styles.bannerButton}
							disabled={undoing}
							aria-busy={undoing || undefined}
							onClick={() => void undo(guest.id, guest.name)}
						>
							{undoing ? "Undoing…" : "Undo"}
						</button>
					) : null}
					{auto ? null : (
						<button
							type="button"
							className={styles.bannerButton}
							onClick={dismiss}
						>
							Next
						</button>
					)}
					<button
						type="button"
						className={styles.bannerClose}
						onClick={dismiss}
						aria-label="Clear"
					>
						<CloseIcon />
					</button>
				</div>
			) : null}
			<p className={styles.srOnly} aria-live="assertive">
				{spoken}
			</p>

			{mode === "scan" ? (
				<section className={styles.scanPanel} aria-label="Scanner">
					<div className={styles.viewfinder}>
						<video
							ref={videoRef}
							className={styles.video}
							playsInline
							muted
							tabIndex={-1}
							data-on={phase === "scanning" || undefined}
						/>
						{phase === "scanning" ? (
							<>
								<span className={styles.corners} aria-hidden="true" />
								<span className={styles.scanline} aria-hidden="true" />
								<div className={styles.camTools}>
									<button
										type="button"
										className={styles.camTool}
										onClick={() => void flip()}
									>
										Flip
									</button>
									{torch === null ? null : (
										<button
											type="button"
											className={styles.camTool}
											aria-pressed={torch}
											onClick={() => void flipTorch()}
										>
											Torch
										</button>
									)}
									<button
										type="button"
										className={styles.camStop}
										onClick={stop}
									>
										Stop
									</button>
								</div>
							</>
						) : (
							<div className={styles.idle}>
								<p className={styles.idleTitle}>
									{phase === "denied"
										? "The camera is blocked"
										: phase === "insecure"
											? "The camera needs a secure page"
											: phase === "nocamera"
												? "No camera found"
												: "Camera off"}
								</p>
								<p className={styles.idleText}>
									{phase === "denied"
										? "Allow the camera for this site in your browser's settings, or use Type code."
										: phase === "insecure"
											? "Open this page over https, or use Type code."
											: phase === "nocamera"
												? "Use a phone or laptop with a camera, or Type code."
												: "Start it to scan passes one after another."}
								</p>
								<button
									type="button"
									className={styles.primaryButton}
									onClick={() =>
										doors.enabled ? setPicking("start") : void start()
									}
									disabled={phase === "starting"}
									aria-busy={phase === "starting" || undefined}
								>
									{phase === "starting"
										? "Starting…"
										: phase === "idle"
											? "Start camera"
											: "Try again"}
								</button>
							</div>
						)}
					</div>
					<div className={styles.scanSide}>
						<div className={styles.scanHead}>
							<h3 className={styles.scanTitle}>Scanner</h3>
							<label className={styles.toggle}>
								<span>Auto-advance</span>
								<input
									type="checkbox"
									role="switch"
									aria-checked={auto}
									className={styles.toggleInput}
									checked={auto}
									onChange={(e) => {
										setAuto(e.target.checked);
										store(KEYS.auto, e.target.checked ? "on" : "off");
										// Turned back on while waiting for Next: read again.
										if (e.target.checked) busyRef.current = false;
									}}
								/>
							</label>
						</div>
						<p className={styles.hint}>
							{auto
								? "Point at a pass. Valid passes check in with a sound, and the next one is read straight away."
								: "Point at a pass. Each answer stays until you tap Next."}
						</p>
						<button
							type="button"
							className={styles.secondaryButton}
							aria-pressed={sound}
							onClick={() => {
								setSound(!sound);
								store(KEYS.sound, sound ? "off" : "on");
								wakeSound();
							}}
						>
							{sound ? "Sound on" : "Sound off"}
						</button>
					</div>
				</section>
			) : (
				<TypeCode
					ref={typeRef}
					eventId={eventId}
					onCode={async (code) => {
						if (needsDoor()) return;
						await check(() => scanCode(eventId, code, doorRef.current));
					}}
					onPick={async (g) => {
						if (needsDoor()) return;
						await check(() => checkInGuest(eventId, g.id, doorRef.current));
					}}
				/>
			)}

			<DoorGuests
				eventId={eventId}
				version={version}
				stamp={count ? `${count.in}/${count.of}` : null}
				total={count?.of ?? null}
				onCheckIn={async (g: DoorGuest) => {
					wakeSound();
					if (needsDoor()) return;
					await check(() => checkInGuest(eventId, g.id, doorRef.current));
				}}
				onUndo={(g: DoorGuest) => undo(g.id, g.name)}
				onWalkIn={walkIn ? () => setAdding(true) : null}
			/>

			{doors.enabled ? (
				<DoorPicker
					open={picking !== null}
					doors={doors}
					current={door?.id ?? null}
					purpose={picking ?? "change"}
					onClose={() => setPicking(null)}
					onPick={(picked) => {
						const starting = picking === "start";
						setDoorId(picked);
						doorRef.current = picked;
						rememberDoor(eventId, picked);
						if (starting) void start();
					}}
				/>
			) : null}

			{doorSetup ? (
				<DoorsPanel
					open={setting}
					eventId={eventId}
					doors={doors}
					setup={doorSetup}
					onClose={() => setSetting(false)}
				/>
			) : null}

			{walkIn ? (
				<GuestFormPanel
					eventId={eventId}
					mode={adding ? { kind: "invite" } : null}
					fields={walkIn.fields}
					tickets={walkIn.tickets}
					emailReady={walkIn.emailReady}
					walkIn
					onClose={() => setAdding(false)}
					onSaved={(guestId, emailPass) => {
						setAdding(false);
						wakeSound();
						void check(() => checkInGuest(eventId, guestId, doorRef.current));
						if (emailPass) void sendPasses(eventId, [guestId]);
						router.refresh();
					}}
					onOpenGuest={(guestId) => {
						setAdding(false);
						wakeSound();
						void check(() => checkInGuest(eventId, guestId, doorRef.current));
					}}
				/>
			) : null}
		</div>
	);
}
