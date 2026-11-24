import type { FieldKind } from "@makemyevent/core";

/**
 * One small drawing per field kind, in currentColor on a 20px grid, so a
 * kind reads at a glance in the list, the type picker and Add Field. Always
 * beside the kind's name: the drawing is never the only label.
 */
const PATHS: Record<FieldKind, React.ReactNode> = {
	short_text: (
		<>
			<path d="M4 6h12M10 6v9" />
		</>
	),
	long_text: (
		<>
			<path d="M4 5.5h12M4 9h12M4 12.5h12M4 16h7" />
		</>
	),
	email: (
		<>
			<rect x="3" y="5" width="14" height="10" rx="2" />
			<path d="m3.5 6 6.5 5 6.5-5" />
		</>
	),
	phone: (
		<>
			<rect x="6" y="2.5" width="8" height="15" rx="2" />
			<path d="M9 14.5h2" />
		</>
	),
	number: (
		<>
			<path d="M8 3.5 6.5 16.5M13.5 3.5 12 16.5M4 7.5h12.5M3.5 12.5H16" />
		</>
	),
	select: (
		<>
			<rect x="3" y="5" width="14" height="10" rx="2" />
			<path d="m10.5 9 2 2 2-2" />
		</>
	),
	radio: (
		<>
			<circle cx="10" cy="10" r="6.5" />
			<circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
		</>
	),
	checkboxes: (
		<>
			<rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
			<path d="m7 10 2 2 4-4.5" />
		</>
	),
	yes_no: (
		<>
			<rect x="2.5" y="6" width="15" height="8" rx="4" />
			<circle cx="13.5" cy="10" r="2.25" fill="currentColor" stroke="none" />
		</>
	),
	date: (
		<>
			<rect x="3" y="4.5" width="14" height="12" rx="2" />
			<path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
		</>
	),
	url: (
		<>
			<path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24l-.75.75" />
			<path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l.75-.75" />
		</>
	),
	consent: (
		<>
			<path d="M10 2.5 4 5v4.5c0 4 2.6 6.9 6 8 3.4-1.1 6-4 6-8V5l-6-2.5Z" />
			<path d="m7.5 10 1.75 1.75L12.75 8" />
		</>
	),
	file: (
		<>
			<path d="M11.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Z" />
			<path d="M11.5 2.5v4h4M10 9.5v5M7.75 11.75 10 9.5l2.25 2.25" />
		</>
	),
	heading: (
		<>
			<path d="M5 4v12M15 4v12M5 10h10" />
		</>
	),
};

export function KindIcon({
	kind,
	className,
}: {
	kind: FieldKind;
	className?: string | undefined;
}) {
	return (
		<svg
			className={className}
			viewBox="0 0 20 20"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{PATHS[kind]}
		</svg>
	);
}

/** The drag handle: six dots. */
export function GripIcon({ className }: { className?: string | undefined }) {
	return (
		<svg
			className={className}
			viewBox="0 0 20 20"
			width="20"
			height="20"
			fill="currentColor"
			aria-hidden="true"
			focusable="false"
		>
			{[6, 10, 14].map((y) =>
				[7.5, 12.5].map((x) => (
					<circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />
				)),
			)}
		</svg>
	);
}

export function LockIcon({ className }: { className?: string | undefined }) {
	return (
		<svg
			className={className}
			viewBox="0 0 20 20"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<rect x="4.5" y="9" width="11" height="8" rx="1.5" />
			<path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
		</svg>
	);
}

/** "Show if": a path that forks. */
export function BranchIcon({ className }: { className?: string | undefined }) {
	return (
		<svg
			className={className}
			viewBox="0 0 20 20"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<circle cx="5.5" cy="4.5" r="1.75" />
			<circle cx="14.5" cy="15.5" r="1.75" />
			<path d="M5.5 6.25v3.25a3 3 0 0 0 3 3h4.25" />
		</svg>
	);
}

export function AlertIcon({ className }: { className?: string | undefined }) {
	return (
		<svg
			className={className}
			viewBox="0 0 20 20"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<circle cx="10" cy="10" r="7.5" />
			<path d="M10 6v4.5M10 13.75v.01" />
		</svg>
	);
}
