"use client";

import { useState } from "react";
import type { JSX } from "react";
import { pillButtonClass } from "./pill-button";

const START = 128;
const CAPACITY = 150;

/** Check-in counter: each "Scan pass" adds one, stopping at capacity. */
export function ScanTile(): JSX.Element {
	const [count, setCount] = useState<number>(START);
	const isFull = count >= CAPACITY;

	return (
		<>
			<div className="flex min-w-0 grow basis-40 flex-col gap-3">
				<span
					role="status"
					className="font-mono text-3xl leading-none font-medium bento-compact:text-2xl"
				>
					{count}/{CAPACITY}
				</span>
				<span
					aria-hidden="true"
					className="block h-2 overflow-hidden rounded-full bg-perforation"
				>
					<span
						className="block h-full origin-left bg-ink transition-transform duration-300 ease-landing motion-reduce:transition-none"
						style={{ transform: `scaleX(${count / CAPACITY})` }}
					/>
				</span>
			</div>
			<button
				type="button"
				disabled={isFull}
				onClick={() => setCount((c) => Math.min(c + 1, CAPACITY))}
				className={pillButtonClass("secondary", "sm")}
			>
				{isFull ? "All checked in" : "Scan pass"}
			</button>
		</>
	);
}
