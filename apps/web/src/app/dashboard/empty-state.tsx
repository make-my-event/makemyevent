import Link from "next/link";
import styles from "./dashboard.module.css";

/**
 * Every empty list on the dashboard is the same shape: what is missing, what
 * to do about it, and the control that does it.
 */
/** The empty state's button style, for an action that is a control of its own. */
export const emptyActionClass = styles.emptyAction;

function isLink(value: unknown): value is { label: string; href: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"href" in value &&
		"label" in value
	);
}

export function EmptyState({
	title,
	body,
	action,
}: {
	title: string;
	body: string;
	/** A link to go somewhere, or a control of its own (styled with emptyActionClass). */
	action: { label: string; href: string } | React.ReactNode;
}) {
	return (
		<div className={styles.empty}>
			<p className={styles.emptyTitle}>{title}</p>
			<p className={styles.emptyBody}>{body}</p>
			{isLink(action) ? (
				<Link className={styles.emptyAction} href={action.href}>
					{action.label}
				</Link>
			) : (
				action
			)}
		</div>
	);
}
