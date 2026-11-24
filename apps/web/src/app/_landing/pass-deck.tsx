"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QrPattern } from "@/components/qr-pattern";
import styles from "../landing.module.css";

export type SamplePass = {
	kind: string;
	badge: string;
	title: string;
	date: string;
	venue: string;
	attendee: string;
	code: string;
	seed: number;
};

/* Long enough to read the pass on top before it moves. */
const FIRST_TURN_AFTER = 2400;
const LIFT_MS = 360;

/**
 * A fanned deck of passes. The front one lifts away and tucks behind the rest.
 *
 * It turns once, shortly after load, and then stays where it is: the lift is
 * there to say that this is a stack of passes and that the one on top can be
 * changed, which it has said by the time it lands. Nothing repeats on its own
 *, so there is nothing to pause — turning it after that is the
 * reader's to ask for, with Next pass. Where the system asks for reduced
 * motion there is no opening turn and no lift, only the swap.
 */
export function PassDeck({ passes }: { passes: SamplePass[] }) {
	const [front, setFront] = useState(0);
	const [lifting, setLifting] = useState(false);
	const [reducedMotion, setReducedMotion] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	// Latched by the first turn, whoever causes it, so there is never a second
	// automatic one — including after the reader has cycled back to the start.
	const opened = useRef(false);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => setReducedMotion(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);

	const advance = useCallback(() => {
		opened.current = true;
		if (reducedMotion) {
			setFront((value) => (value + 1) % passes.length);
			return;
		}
		setLifting(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => {
			setFront((value) => (value + 1) % passes.length);
			setLifting(false);
		}, LIFT_MS);
	}, [passes.length, reducedMotion]);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	// The one opening turn. Skipped outright under reduced motion, and skipped
	// if the reader got there first, so their turn is never taken over.
	useEffect(() => {
		if (reducedMotion || opened.current) return;
		const opening = window.setTimeout(advance, FIRST_TURN_AFTER);
		return () => window.clearTimeout(opening);
	}, [reducedMotion, advance]);

	return (
		<div className={styles.deckWrap}>
			<div className={styles.deckStack}>
				<ul className={styles.deck} data-lifting={lifting ? "true" : undefined}>
					{passes.map((pass, index) => {
						const position = (index - front + passes.length) % passes.length;
						const atFront = position === 0;
						return (
							<li
								key={pass.code}
								className={styles.deckItem}
								data-position={position}
								data-lifting={atFront && lifting ? "true" : undefined}
								aria-hidden={atFront ? undefined : "true"}
								{...(atFront ? {} : { inert: true })}
							>
								<article className={styles.pass}>
									<div className={styles.passTop}>
										<p className={styles.passKind}>
											<span>{pass.kind}</span>
											<span className={styles.passBadge}>{pass.badge}</span>
										</p>
										<p className={styles.passTitle}>{pass.title}</p>
										<p className={styles.passMeta}>
											<span>
												<svg
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="1.5"
													strokeLinecap="round"
													strokeLinejoin="round"
													aria-hidden="true"
												>
													<rect
														x="3.5"
														y="5"
														width="17"
														height="15.5"
														rx="2.5"
													/>
													<path d="M3.5 10h17M8 3v4M16 3v4" />
												</svg>
												{pass.date}
											</span>
											<span>
												<svg
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="1.5"
													strokeLinecap="round"
													strokeLinejoin="round"
													aria-hidden="true"
												>
													<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z" />
													<circle cx="12" cy="9.5" r="2.5" />
												</svg>
												{pass.venue}
											</span>
										</p>
									</div>

									<div className={styles.passStub}>
										<span className={styles.passQrTile}>
											<QrPattern seed={pass.seed} className={styles.passQr} />
										</span>
										<span className={styles.passWho}>
											<span className={styles.passAdmit}>Admit one</span>
											<span className={styles.passName}>{pass.attendee}</span>
											<span className={styles.passCode}>{pass.code}</span>
										</span>
									</div>
								</article>
							</li>
						);
					})}
				</ul>
			</div>

			<p className={styles.deckControls}>
				<button type="button" className={styles.deckButton} onClick={advance}>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5" />
					</svg>
					Next pass
				</button>
			</p>
		</div>
	);
}
