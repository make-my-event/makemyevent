/**
 * Icons for the event sidebar. 24-unit outline drawings in currentColor, so
 * each takes the colour of its link: muted at rest, stamp when current.
 * Shapes follow Lucide (ISC), redrawn inline so no icon package ships.
 */

type IconProps = { className?: string | undefined };

function Icon({
	className,
	children,
}: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

/** The sidebar itself: a panel with its left column marked. */
export function SidebarIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<path d="M9 3v18" />
		</Icon>
	);
}

/** Overview: a dashboard of tiles. */
export function OverviewIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect x="3" y="3" width="7" height="9" rx="1" />
			<rect x="14" y="3" width="7" height="5" rx="1" />
			<rect x="14" y="12" width="7" height="9" rx="1" />
			<rect x="3" y="16" width="7" height="5" rx="1" />
		</Icon>
	);
}

/** Event page: the public page on the web. */
export function EventPageIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="9" />
			<path d="M3 12h18" />
			<path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
		</Icon>
	);
}

/** Form builder: a clipboard of fields. */
export function FormIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect x="8" y="2" width="8" height="4" rx="1" />
			<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
			<path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
		</Icon>
	);
}

/** RSVP: a reply that has been accepted. */
export function RsvpIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
			<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
			<path d="m16 19 2 2 4-4" />
		</Icon>
	);
}

/** CFP, the call for proposals: talks people offer to give. */
export function CfpIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect x="9" y="2" width="6" height="12" rx="3" />
			<path d="M19 10v1a7 7 0 0 1-14 0v-1" />
			<path d="M12 18v4M8 22h8" />
		</Icon>
	);
}

/** Guests: the people coming. */
export function GuestsIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
		</Icon>
	);
}

/** Scan QR: a viewfinder over a code. */
export function ScanIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
			<rect x="7" y="7" width="4" height="4" rx="0.5" />
			<rect x="13" y="13" width="4" height="4" rx="0.5" />
			<path d="M13 7h4v3M7 17h3v-3" />
		</Icon>
	);
}

/** Post event: what follows once it is over. A calendar day ticked off. */
export function PostEventIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect x="3" y="4" width="18" height="18" rx="2" />
			<path d="M16 2v4M8 2v4M3 10h18" />
			<path d="m9 16 2 2 4-4" />
		</Icon>
	);
}

/** Schedule: the running order, by time. */
export function ScheduleIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</Icon>
	);
}

/** Tickets. */
export function TicketsIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
			<path d="M13 5v2M13 17v2M13 11v2" />
		</Icon>
	);
}

/** Partners and sponsors: a handshake. */
export function PartnersIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m11 17 2 2a1 1 0 1 0 3-3" />
			<path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
			<path d="m21 3 1 11h-2" />
			<path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
			<path d="M3 4h8" />
		</Icon>
	);
}
