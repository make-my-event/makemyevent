"use client";

import { useEffect, useRef } from "react";
import type { JSX, ReactNode } from "react";

export interface TicketTiltProps {
	children: ReactNode;
	className?: string;
}

const MAX_TILT_DEG = 6;

/**
 * Tilts its first child toward the pointer. Only on devices with a fine
 * pointer that can hover, and never with prefers-reduced-motion.
 */
export function TicketTilt({
	children,
	className,
}: TicketTiltProps): JSX.Element {
	const wrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const wrap = wrapRef.current;
		const target = wrap?.firstElementChild;
		if (!wrap || !(target instanceof HTMLElement)) return;
		const canTilt = window.matchMedia(
			"(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
		).matches;
		if (!canTilt) return;

		function handleMove(event: PointerEvent): void {
			if (!wrap || !(target instanceof HTMLElement)) return;
			const rect = wrap.getBoundingClientRect();
			const x = (event.clientX - rect.left) / rect.width - 0.5;
			const y = (event.clientY - rect.top) / rect.height - 0.5;
			target.style.transform = `rotateY(${(x * MAX_TILT_DEG).toFixed(2)}deg) rotateX(${(-y * MAX_TILT_DEG).toFixed(2)}deg)`;
		}
		function handleLeave(): void {
			if (target instanceof HTMLElement) target.style.transform = "";
		}

		wrap.addEventListener("pointermove", handleMove);
		wrap.addEventListener("pointerleave", handleLeave);
		return () => {
			wrap.removeEventListener("pointermove", handleMove);
			wrap.removeEventListener("pointerleave", handleLeave);
		};
	}, []);

	return (
		<div ref={wrapRef} className={className}>
			{children}
		</div>
	);
}
