"use client";

import { useState } from "react";
import { QrPattern } from "@/components/qr-pattern";
import styles from "../landing.module.css";

const PEOPLE = [
	"Meera Iyer",
	"Farhan Shaikh",
	"Tanvi Nair",
	"Kabir Menon",
	"Sneha Patil",
	"Arjun Rao",
];
const TOTAL = 212;

/** A sample door scan. Nothing happens until someone presses the button. */
export function CheckInDemo() {
	const [scanned, setScanned] = useState(0);
	const checkedIn = 143 + scanned;
	const person = PEOPLE[scanned % PEOPLE.length] ?? PEOPLE[0];
	const minute = String((4 + scanned) % 60).padStart(2, "0");

	return (
		<div className={styles.scanner}>
			<div className={styles.scanFrame}>
				<QrPattern seed={41 + scanned} className={styles.scanQr} />
			</div>

			<div className={styles.scanOut}>
				<p className={styles.scanResult} aria-live="polite">
					<span className={styles.tick}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="m5 12.5 4.5 4.5L19 7.5" />
						</svg>
					</span>
					<span className={styles.scanWho}>
						<strong>{person}</strong>
						<small>Checked in at 10:{minute}&nbsp;am</small>
					</span>
				</p>

				<div className={styles.scanFoot}>
					<span className={styles.count}>
						<strong>{checkedIn}</strong> of {TOTAL} checked in
					</span>
					<button
						type="button"
						className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
						onClick={() => setScanned((value) => value + 1)}
						disabled={checkedIn >= TOTAL}
					>
						Scan next pass
					</button>
				</div>
			</div>
		</div>
	);
}
