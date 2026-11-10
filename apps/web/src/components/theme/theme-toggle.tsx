"use client";

import { useTheme } from "./theme-provider";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import type { JSX } from "react";

export interface ThemeToggleProps {
	/** "pill": round landing-page style. Default: the app's square button. */
	variant?: "default" | "pill";
}

export function ThemeToggle({
	variant = "default",
}: ThemeToggleProps = {}): JSX.Element {
	const { resolvedTheme, toggleTheme } = useTheme();
	const [mounted, setMounted] = useState<boolean>(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// The pill picks its icon with `dark:` (ThemeScript has already set the
	// class before paint), so it renders the right icon on the server too and
	// needs no mount placeholder.
	if (variant === "pill") {
		return (
			<button
				type="button"
				onClick={toggleTheme}
				aria-label="Switch color theme"
				className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-ink/15 text-ink transition-colors duration-150 hover:border-ink motion-reduce:transition-none"
			>
				<Moon aria-hidden="true" className="size-5 dark:hidden" />
				<Sun aria-hidden="true" className="hidden size-5 dark:block" />
			</button>
		);
	}

	if (!mounted) {
		return (
			<div
				className="h-11 w-11 rounded-md border border-ink/50"
				aria-hidden="true"
			/>
		);
	}

	const isDark = resolvedTheme === "dark";

	return (
		<button
			type="button"
			onClick={toggleTheme}
			className="flex h-11 w-11 items-center justify-center rounded-md border border-ink/50 text-ink/70 transition-colors duration-150 hover:bg-perforation/20 hover:text-ink"
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
			title={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? (
				<svg
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-ink"
				>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2" />
					<path d="M12 20v2" />
					<path d="m4.93 4.93 1.41 1.41" />
					<path d="m17.66 17.66 1.41 1.41" />
					<path d="M2 12h2" />
					<path d="M20 12h2" />
					<path d="m6.34 17.66-1.41 1.41" />
					<path d="m19.07 4.93-1.41 1.41" />
				</svg>
			) : (
				<svg
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-ink"
				>
					<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
				</svg>
			)}
		</button>
	);
}
