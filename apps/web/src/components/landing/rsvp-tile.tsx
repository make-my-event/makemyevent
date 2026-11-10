"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

/** Register button that toggles, announcing each change to screen readers. */
export function RsvpTile(): JSX.Element {
	const [isRegistered, setIsRegistered] = useState<boolean>(false);
	const [announcement, setAnnouncement] = useState<string>("");

	function toggle(): void {
		const next = !isRegistered;
		setIsRegistered(next);
		setAnnouncement(next ? "Registered." : "Registration removed.");
	}

	return (
		<>
			<button
				type="button"
				onClick={toggle}
				className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border px-5 font-medium bento-compact:px-4 transition-[border-color,scale] duration-150 active:scale-98 motion-reduce:transition-none motion-reduce:active:scale-100 ${
					isRegistered
						? // Narrower in compact half-width tiles (14px text, 16px
							// icon, 4px gap) so "Registered" fits without resizing
							// the grid; at 360px the 8px gap left it 1px too wide.
							"border-ink/50 text-ink bento-compact:gap-1 bento-compact:text-sm"
						: "border-stamp bg-stamp text-paper"
				}`}
			>
				{isRegistered ? (
					<>
						<Check
							aria-hidden="true"
							className="size-5 text-stamp bento-compact:size-4"
						/>
						Registered
					</>
				) : (
					"Register"
				)}
			</button>
			<span role="status" className="sr-only">
				{announcement}
			</span>
		</>
	);
}
