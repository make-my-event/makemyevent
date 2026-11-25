"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { TURNSTILE_ORIGIN } from "@/lib/turnstile";
import { ErrorIcon } from "./error-icon";
import styles from "./signin.module.css";

type Turnstile = {
	render(element: HTMLElement, options: Record<string, unknown>): string;
	reset(id: string): void;
	remove(id: string): void;
};

/** Cloudflare allows its script only from its own address, unproxied. */
const SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
/** Narrower than this, the box is the compact one. */
const FULL_WIDTH = 300;
/** A check nobody is asked to help with takes a second or two. */
const GIVE_UP_MS = 20_000;

let loading: Promise<Turnstile> | null = null;

/** Once per page. A failure is forgotten, so it can be tried again. */
function load(): Promise<Turnstile> {
	const held = () => (window as { turnstile?: Turnstile }).turnstile;
	loading ??= new Promise<Turnstile>((done, fail) => {
		const ready = held();
		if (ready) return done(ready);
		const script = document.createElement("script");
		script.src = SCRIPT;
		script.async = true;
		const failed = () => {
			script.remove();
			loading = null;
			fail(new Error("Turnstile did not load"));
		};
		script.onload = () => {
			const turnstile = held();
			if (turnstile) done(turnstile);
			else failed();
		};
		script.onerror = failed;
		document.head.append(script);
	});
	return loading;
}

type Phase = "checking" | "asking" | "passed" | "failed";

/**
 * A form that is sent with proof its sender is not a bot. Pressing the button
 * before the proof has arrived is remembered, and the form goes when it does.
 *
 * Without a site key this is a plain form. A token works once, so a new one
 * is fetched whenever `spent` changes: after each answer from the server.
 */
export function CheckedForm({
	siteKey,
	action,
	spent,
	className,
	before,
	children,
}: {
	siteKey: string | null;
	action: (form: FormData) => void;
	spent: unknown;
	className?: string | undefined;
	/** The fields, above the check. */
	before?: ReactNode;
	/** The button, below it. `waiting`: pressed, and held until the check passes. */
	children: (waiting: boolean) => ReactNode;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	const resetRef = useRef<(() => void) | null>(null);
	const [token, setToken] = useState("");
	const [phase, setPhase] = useState<Phase>("checking");
	const [waiting, setWaiting] = useState(false);
	const [attempt, setAttempt] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt is "Try again"
	useEffect(() => {
		if (!siteKey) return;
		let gone = false;
		let remove = () => {};

		const fail = () => {
			setToken("");
			setPhase("failed");
			setWaiting(false);
		};

		const draw = (turnstile: Turnstile) => {
			const box = boxRef.current;
			if (!box || gone) return;
			remove();
			setToken("");
			setPhase("checking");
			const id = turnstile.render(box, {
				sitekey: siteKey,
				action: "signin",
				size: box.clientWidth < FULL_WIDTH ? "compact" : "flexible",
				theme: document.documentElement.classList.contains("dark")
					? "dark"
					: "light",
				"response-field": false,
				callback: (value: string) => {
					setToken(value);
					setPhase("passed");
				},
				"before-interactive-callback": () => setPhase("asking"),
				"after-interactive-callback": () => setPhase("checking"),
				"expired-callback": () => {
					setToken("");
					setPhase("checking");
				},
				"unsupported-callback": fail,
				"error-callback": () => {
					fail();
					// Said on the page; nothing for the console.
					return true;
				},
			});
			remove = () => turnstile.remove(id);
			resetRef.current = () => {
				setToken("");
				setPhase("checking");
				turnstile.reset(id);
			};
		};

		setPhase("checking");
		let redraw: MutationObserver | null = null;
		load().then(
			(turnstile) => {
				if (gone) return;
				draw(turnstile);
				// The box is drawn in one theme, so a switch draws it again.
				const isDark = () =>
					document.documentElement.classList.contains("dark");
				let dark = isDark();
				redraw = new MutationObserver(() => {
					if (isDark() === dark) return;
					dark = isDark();
					draw(turnstile);
				});
				redraw.observe(document.documentElement, {
					attributeFilter: ["class"],
				});
			},
			() => {
				if (!gone) fail();
			},
		);
		return () => {
			gone = true;
			redraw?.disconnect();
			resetRef.current = null;
			remove();
		};
	}, [siteKey, attempt]);

	// The server has answered, so the token it was sent is used up.
	const seen = useRef(spent);
	useEffect(() => {
		if (seen.current === spent) return;
		seen.current = spent;
		resetRef.current?.();
	}, [spent]);

	// Passed while someone was waiting: send what they asked to send.
	useEffect(() => {
		if (!waiting || !token) return;
		setWaiting(false);
		formRef.current?.requestSubmit();
	}, [waiting, token]);

	// Neither passed nor failed nor asking anything: something blocked it.
	useEffect(() => {
		if (!waiting || phase !== "checking") return;
		const timer = window.setTimeout(() => {
			setWaiting(false);
			setPhase("failed");
		}, GIVE_UP_MS);
		return () => window.clearTimeout(timer);
	}, [waiting, phase]);

	return (
		<form
			ref={formRef}
			className={className}
			action={action}
			noValidate
			onSubmit={(event) => {
				if (!siteKey || token) return;
				event.preventDefault();
				if (phase === "failed") setAttempt((n) => n + 1);
				setWaiting(true);
			}}
		>
			{before}
			{siteKey ? (
				<>
					<input type="hidden" name="captcha" value={token} />
					<div>
						<div ref={boxRef} className={styles.check} />
						<noscript>
							<p className={styles.checkNote}>
								Email sign-in needs JavaScript. Turn it on, or continue with
								Google.
							</p>
						</noscript>
						{/* Always here, so its words are announced when they arrive. */}
						<p className={styles.checkNote} role="status">
							{waiting && phase === "asking" ? "Tick the box to continue." : ""}
						</p>
					</div>
					{phase === "failed" ? (
						<p className={styles.error} role="alert">
							<ErrorIcon />
							<span>
								We couldn't check that you're not a bot. A content blocker or
								your network may be stopping it. Try again, or continue with
								Google.
							</span>
						</p>
					) : null}
				</>
			) : null}
			{children(waiting && phase !== "asking")}
		</form>
	);
}
