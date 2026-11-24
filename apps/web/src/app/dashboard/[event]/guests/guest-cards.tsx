import Link from "next/link";
import {
	BlockIcon,
	LeftUserIcon,
	MailIcon,
	RightIcon,
} from "@/components/icons";
import styles from "./guests.module.css";

const count = new Intl.NumberFormat("en-US");

/**
 * The three ways in and out of the list besides registering: guests the
 * team invited, contacts that may not register, and people who left before
 * finishing. Each card is itself the way in (Invite
 * opens the form, Blocklist its page); Dropped isn't built yet and says so.
 */
export function GuestCards({
	invited,
	blocked,
	canManage,
	onInvite,
	blocklistHref,
}: {
	invited: number;
	blocked: number;
	canManage: boolean;
	onInvite: () => void;
	blocklistHref: string;
}) {
	const invites = (
		<>
			<span className={styles.cardIcon}>
				<MailIcon />
			</span>
			<span className={styles.cardText}>
				<span className={styles.cardTitle}>Invites</span>
				<span className={styles.cardBody}>
					{canManage
						? "Add guests yourself, one or many"
						: "Guests the team added"}
				</span>
			</span>
			<span className={styles.cardCount}>
				<span className={styles.srOnly}>, </span>
				{count.format(invited)}
				<span className={styles.srOnly}> invited</span>
			</span>
		</>
	);
	const blocklist = (
		<>
			<span className={styles.cardIcon}>
				<BlockIcon />
			</span>
			<span className={styles.cardText}>
				<span className={styles.cardTitle}>Blocklist</span>
				<span className={styles.cardBody}>
					Emails and numbers that can't register
				</span>
			</span>
			<span className={styles.cardCount}>
				<span className={styles.srOnly}>, </span>
				{count.format(blocked)}
				<span className={styles.srOnly}> blocked</span>
			</span>
		</>
	);
	// The whole card is the way in: one target, named by what it shows.
	const go = (
		<span className={styles.cardGo} aria-hidden="true">
			<RightIcon />
		</span>
	);

	return (
		<ul className={styles.cards} aria-label="Invites, blocklist and dropped">
			<li className={styles.cardSlot}>
				{canManage ? (
					<button type="button" className={styles.cardItem} onClick={onInvite}>
						{invites}
						{go}
					</button>
				) : (
					<div className={styles.cardItem}>{invites}</div>
				)}
			</li>
			<li className={styles.cardSlot}>
				{canManage ? (
					<Link className={styles.cardItem} href={blocklistHref}>
						{blocklist}
						{go}
					</Link>
				) : (
					<div className={styles.cardItem}>{blocklist}</div>
				)}
			</li>
			<li className={styles.cardSlot}>
				<div className={styles.cardItem}>
					<span className={styles.cardIcon}>
						<LeftUserIcon />
					</span>
					<span className={styles.cardText}>
						<span className={styles.cardTitle}>Dropped</span>
						<span className={styles.cardBody}>
							Started registering, didn't finish
						</span>
					</span>
					<span className={styles.soonTag}>Coming soon</span>
				</div>
			</li>
		</ul>
	);
}
