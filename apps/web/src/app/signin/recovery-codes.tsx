"use client";

import { useCopy } from "@/components/ui/use-copy";
import styles from "./signin.module.css";
import twoStep from "./two-step.module.css";

/** Ten codes, shown this once, and two ways to keep them. */
export function RecoveryCodes({ codes }: { codes: readonly string[] }) {
	const { copied, copy } = useCopy();
	const text = codes.join("\n");

	function download() {
		const href = URL.createObjectURL(
			new Blob(
				[
					`MakeMyEvent recovery codes\n\n${text}\n\nEach code works once. Keep them somewhere safe.\n`,
				],
				{ type: "text/plain" },
			),
		);
		const link = document.createElement("a");
		link.href = href;
		link.download = "makemyevent-recovery-codes.txt";
		link.click();
		window.setTimeout(() => URL.revokeObjectURL(href), 1000);
	}

	return (
		<div>
			<ul className={twoStep.codes} aria-label="Recovery codes">
				{codes.map((code) => (
					<li key={code}>{code}</li>
				))}
			</ul>
			<div className={twoStep.pair}>
				<button
					type="button"
					className={`${styles.btn} ${styles.btnSecondary}`}
					onClick={() => void copy(text)}
				>
					<span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
				</button>
				<button
					type="button"
					className={`${styles.btn} ${styles.btnSecondary}`}
					onClick={download}
				>
					Download
				</button>
			</div>
		</div>
	);
}
