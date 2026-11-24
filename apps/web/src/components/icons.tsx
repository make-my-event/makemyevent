/**
 * The interface's line icons: one 16px grid, one 1.25 stroke, round caps
 * and joins, so any two sit level beside each other. Drawn for this project;
 * colour comes from currentColor, so the palette and dark mode follow.
 * Decorative: the control around each one carries its label.
 */

type IconProps = { className?: string | undefined };

function Icon({
	className,
	children,
}: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			className={className}
			width={16}
			height={16}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.25}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{children}
		</svg>
	);
}

/** Two sheets, the front one whole. */
export function CopyIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" />
			<path d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" />
		</Icon>
	);
}

/** Copy, with a plus on the front sheet: make another like this. */
export function DuplicateIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" />
			<path d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" />
			<path d="M9.75 8v4M7.75 10h4" />
		</Icon>
	);
}

export function CalendarIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="2" y="3" width="12" height="11" rx="1.75" />
			<path d="M5.25 1.75v2.5M10.75 1.75v2.5M2 6.75h12" />
		</Icon>
	);
}

export function PeopleIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<circle cx="6" cy="5.25" r="2.5" />
			<path d="M1.75 13.75c0-2.35 1.9-4.25 4.25-4.25s4.25 1.9 4.25 4.25" />
			<path d="M10.5 2.9a2.5 2.5 0 0 1 0 4.7M12 9.9a4.25 4.25 0 0 1 2.25 3.85" />
		</Icon>
	);
}

export function RightIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M6 3.5L10.5 8L6 12.5" />
		</Icon>
	);
}

/** A pencil. */
export function EditIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M10.9 2.35a1.5 1.5 0 0 1 2.12 0l.63.63a1.5 1.5 0 0 1 0 2.12L5.5 13.25 2 14l.75-3.5z" />
			<path d="M9.5 3.75l2.75 2.75" />
		</Icon>
	);
}

/** Two links of a chain. */
export function LinkIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M6.5 9.5l3-3" />
			<path d="M7.25 4.75l1.1-1.1a2.85 2.85 0 0 1 4.03 4.03l-1.1 1.1" />
			<path d="M8.75 11.25l-1.1 1.1a2.85 2.85 0 0 1-4.03-4.03l1.1-1.1" />
		</Icon>
	);
}

export function TrashIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M2.5 4h11" />
			<path d="M6 4V2.75c0-.41.34-.75.75-.75h2.5c.41 0 .75.34.75.75V4" />
			<path d="M3.75 4l.66 8.6A1.5 1.5 0 0 0 5.9 14h4.2a1.5 1.5 0 0 0 1.49-1.4L12.25 4" />
			<path d="M6.75 7v4M9.25 7v4" />
		</Icon>
	);
}

export function TickIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M13 4.5L6.5 11L3 7.5" />
		</Icon>
	);
}

/** Three finder squares, each with its centre, and a few modules. */
export function QrIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="1.5" y="1.5" width="5" height="5" rx="1" />
			<rect x="9.5" y="1.5" width="5" height="5" rx="1" />
			<rect x="1.5" y="9.5" width="5" height="5" rx="1" />
			<g fill="currentColor" stroke="none">
				<rect x="3.25" y="3.25" width="1.5" height="1.5" rx="0.25" />
				<rect x="11.25" y="3.25" width="1.5" height="1.5" rx="0.25" />
				<rect x="3.25" y="11.25" width="1.5" height="1.5" rx="0.25" />
				<rect x="9.5" y="9.5" width="2" height="2" rx="0.4" />
				<rect x="12.5" y="9.5" width="2" height="2" rx="0.4" />
				<rect x="11" y="11" width="2" height="2" rx="0.4" />
				<rect x="9.5" y="12.5" width="2" height="2" rx="0.4" />
				<rect x="12.5" y="12.5" width="2" height="2" rx="0.4" />
			</g>
		</Icon>
	);
}

export function SearchIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<circle cx="7" cy="7" r="4.75" />
			<path d="M10.5 10.5L14 14" />
		</Icon>
	);
}

export function PlusIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M8 3v10M3 8h10" />
		</Icon>
	);
}

/** An arrow up out of a tray: upload. */
export function UploadIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M8 10.5V2.5M4.75 5.75L8 2.5l3.25 3.25" />
			<path d="M2.5 10.5v1.75c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V10.5" />
		</Icon>
	);
}

/** A cog: settings. */
export function SettingsIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<circle cx="8" cy="8" r="2" />
			<path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.42 3.58l-1.06 1.06M4.64 11.36l-1.06 1.06M12.42 12.42l-1.06-1.06M4.64 4.64 3.58 3.58" />
		</Icon>
	);
}

export function BulletListIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M6 4h8M6 8h8M6 12h8" />
			<circle cx="2.75" cy="4" r=".6" fill="currentColor" />
			<circle cx="2.75" cy="8" r=".6" fill="currentColor" />
			<circle cx="2.75" cy="12" r=".6" fill="currentColor" />
		</Icon>
	);
}

export function NumberedListIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5" />
			<path d="M2 2.75h1.25v3M2 5.75h2.25" strokeWidth={1} />
			<path d="M2 9.5c.3-.5 1.9-.6 2 .25.1.7-2 1.5-2 2.5h2.1" strokeWidth={1} />
		</Icon>
	);
}

export function CodeBlockIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.75" />
			<path d="M6 6.25 4.25 8 6 9.75M10 6.25 11.75 8 10 9.75" />
		</Icon>
	);
}

export function QuoteIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M3 11.5c0-2.5.5-4.5 3-6M3.25 8.25h2.5v3.25H3.25zM9 11.5c0-2.5.5-4.5 3-6M9.25 8.25h2.5v3.25H9.25z" />
		</Icon>
	);
}

export function DividerIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M2 8h12" />
			<path d="M5 4.5h6M5 11.5h6" strokeOpacity={0.45} />
		</Icon>
	);
}

export function ImageIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.75" />
			<circle cx="5.75" cy="6" r="1.25" />
			<path d="m2 12 3.75-3.5 2.5 2.25L11 8l3 3" />
		</Icon>
	);
}

export function UndoIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M5.5 3.5 2.5 6.5l3 3" />
			<path d="M2.75 6.5h6.5a4 4 0 0 1 0 8H6.5" />
		</Icon>
	);
}

export function RedoIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="m10.5 3.5 3 3-3 3" />
			<path d="M13.25 6.5h-6.5a4 4 0 0 0 0 8H9.5" />
		</Icon>
	);
}

/** A cross: close or dismiss. */
export function CloseIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="m4 4 8 8M12 4l-8 8" />
		</Icon>
	);
}

/** A chevron pointing down: a list opens below. Turned with CSS for up. */
export function ChevronDownIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="m4 6 4 4 4-4" />
		</Icon>
	);
}

/** An eye: look at, without changing. */
export function EyeIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
			<circle cx="8" cy="8" r="2" />
		</Icon>
	);
}

/** A funnel: narrow a list down. */
export function FilterIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M2 3h12l-4.75 5.5V13l-2.5-1.25V8.5L2 3Z" />
		</Icon>
	);
}

/** Three columns: choose what a table shows. */
export function ColumnsIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="2" y="3" width="12" height="10" rx="1.5" />
			<path d="M6 3v10M10 3v10" />
		</Icon>
	);
}

/** An envelope: send to someone. */
export function MailIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="2" y="3.5" width="12" height="9" rx="1.5" />
			<path d="m2.5 4.5 5.5 4 5.5-4" />
		</Icon>
	);
}

/** A circle struck through: not allowed. */
export function BlockIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<circle cx="8" cy="8" r="5.5" />
			<path d="m4.1 11.9 7.8-7.8" />
		</Icon>
	);
}

/** A person stepping away: someone who left before finishing. */
export function LeftUserIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<circle cx="6.5" cy="5" r="2.5" />
			<path d="M2 13.5c0-2.5 2-4 4.5-4 1 0 1.9.2 2.6.7M11 10.5l3 3M14 10.5l-3 3" />
		</Icon>
	);
}

/** A phone handset, upright. */
export function PhoneIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
			<path d="M7 12h2" />
		</Icon>
	);
}

/** An arrow down into a tray: save a file. */
export function DownloadIcon({ className }: IconProps) {
	return (
		<Icon className={className}>
			<path d="M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25M2.5 13.5h11" />
		</Icon>
	);
}
