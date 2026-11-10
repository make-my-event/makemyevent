"use client";

import { Star } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { JSX } from "react";

const VALUES = [1, 2, 3, 4, 5];
const POP_MS = 180;

/**
 * Feedback tile: five native radio inputs in a fieldset. The tile's heading
 * and status text are rendered here so the status can change on rating.
 */
export function RatingTile(): JSX.Element {
	const [rating, setRating] = useState<number>(0);
	const [popped, setPopped] = useState<number | null>(null);
	const name = useId();

	useEffect(() => {
		if (popped === null) return;
		const timer = setTimeout(() => setPopped(null), POP_MS);
		return () => clearTimeout(timer);
	}, [popped]);

	return (
		<>
			<div className="flex flex-wrap items-center gap-3">
				<fieldset className="m-0 flex border-0 p-0">
					<legend className="sr-only">Rate this event</legend>
					{VALUES.map((value) => (
						<label
							key={value}
							className="relative inline-flex size-11 items-center justify-center rounded-lg has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-stamp"
						>
							<input
								type="radio"
								name={name}
								value={value}
								checked={rating === value}
								onChange={() => {
									setRating(value);
									setPopped(value);
								}}
								className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
							/>
							<span className="sr-only">
								{value === 1 ? "1 star" : `${value} stars`}
							</span>
							<Star
								aria-hidden="true"
								fill={value <= rating ? "currentColor" : "none"}
								className={`pointer-events-none size-7 transition-transform duration-150 ease-landing motion-reduce:transition-none ${
									popped === value ? "scale-125" : ""
								}`}
							/>
						</label>
					))}
				</fieldset>
			</div>
			<div className="flex flex-col gap-1">
				<h3 className="font-display text-2xl leading-tight font-medium tracking-tight bento-compact:text-lg">
					Feedback
				</h3>
				<p
					role="status"
					className="text-ink/70 bento-compact:text-tile-status-compact"
				>
					{rating > 0 ? "Thanks. Feedback sent." : "Tap to rate."}
				</p>
			</div>
		</>
	);
}
