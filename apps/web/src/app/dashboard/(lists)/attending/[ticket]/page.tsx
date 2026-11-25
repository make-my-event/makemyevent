import { recordId } from "@makemyevent/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RightIcon } from "@/components/icons";
import { asUser } from "@/lib/db";
import { whenText, whereText } from "@/lib/event-text";
import { masterKey, signPass } from "@/lib/pass-token";
import { qrSvg } from "@/lib/qr";
import { imageUrl } from "@/lib/storage";
import { getCurrentUser } from "@/lib/supabase/identity";
import { claimTickets } from "../../../claim-invites";
import dashboard from "../../../dashboard.module.css";
import { myTickets } from "../../../my-tickets";
import { ticketState } from "../../../ticket-state";
import styles from "./ticket.module.css";

export const metadata: Metadata = {
	title: "Your pass",
	robots: { index: false, follow: false },
};

type Props = { params: Promise<{ ticket: string }> };

/**
 * One ticket: the pass to hold up at the door, and the event's when and
 * where. Only its holder's; anyone else gets the same "not found" as an
 * address that doesn't exist.
 */
export default async function TicketPage({ params }: Props) {
	const { ticket: id } = await params;
	const user = await getCurrentUser();
	if (!user)
		redirect(
			`/signin?next=${encodeURIComponent(`/dashboard/attending/${encodeURIComponent(id)}`)}`,
		);
	if (!recordId.safeParse(id).success) notFound();

	const [ticket] = await asUser(user.id, async (tx) => {
		await claimTickets(tx, user);
		return myTickets(tx, id);
	});
	if (!ticket) notFound();

	const state = ticketState(ticket, new Date());
	const master = masterKey();
	const svg =
		state.hasPass && master
			? await qrSvg(
					signPass(master, {
						eventId: ticket.eventId,
						registrationId: ticket.id,
						version: ticket.ticketKeyVersion,
					}),
				)
			: null;
	const when = whenText(ticket.startsAt, ticket.timeZone);
	const where = ticket.format === "online" ? "Online" : whereText(ticket);

	return (
		<main className={dashboard.main}>
			<div className={styles.page}>
				<Link className={styles.back} href="/dashboard/attending">
					<RightIcon className={styles.backIcon} />
					All tickets
				</Link>

				<article className={styles.ticket} aria-labelledby="ticket-title">
					{ticket.posterPath ? (
						// biome-ignore lint/performance/noImgElement: user-uploaded artwork from storage, not a build-time asset
						<img
							className={styles.poster}
							src={imageUrl(`${ticket.posterPath}-1080.webp`)}
							alt=""
							decoding="async"
						/>
					) : null}

					<div className={styles.details}>
						{state.label ? <p className={styles.state}>{state.label}</p> : null}
						<h1 className={styles.title} id="ticket-title">
							{ticket.eventTitle}
						</h1>
						<dl className={styles.facts}>
							<div>
								<dt>When</dt>
								<dd>
									{ticket.startsAt ? (
										<time dateTime={ticket.startsAt.toISOString()}>{when}</time>
									) : (
										"Date not set"
									)}
								</dd>
							</div>
							<div>
								<dt>Where</dt>
								<dd>{where ?? "Venue not set"}</dd>
							</div>
							<div>
								<dt>Ticket</dt>
								<dd>{ticket.ticketName}</dd>
							</div>
							<div>
								<dt>Guest</dt>
								<dd>{ticket.attendeeName}</dd>
							</div>
						</dl>
						{ticket.onlineUrl ? (
							<a
								className={styles.join}
								href={ticket.onlineUrl}
								target="_blank"
								rel="noopener noreferrer"
							>
								Join online
								<span className={dashboard.srOnly}> (opens in a new tab)</span>
							</a>
						) : null}
					</div>

					<div className={styles.stub}>
						{svg ? (
							<>
								<div
									className={styles.qr}
									role="img"
									aria-label="QR code of your pass"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: drawn here by our QR library from a token this server signed
									dangerouslySetInnerHTML={{ __html: svg }}
								/>
								<p className={styles.code}>{ticket.ticketCode}</p>
								<p className={styles.hint}>
									Show this at the door. If it won't scan, read out the code.
								</p>
							</>
						) : (
							<p className={styles.hint}>{noPass(ticket, state.hasPass)}</p>
						)}
					</div>
				</article>
			</div>
		</main>
	);
}

/** Why there is no QR to show. */
function noPass(
	ticket: { status: string; eventStatus: string; ticketCode: string },
	allowed: boolean,
): string {
	if (ticket.eventStatus === "cancelled")
		return "The host cancelled this event, so there is no pass.";
	if (ticket.status === "cancelled")
		return "This ticket was cancelled. Ask the host if that is a surprise.";
	if (ticket.status === "waitlisted")
		return "You're on the waitlist. Your pass appears here once you have a place.";
	return allowed
		? `The QR can't be shown right now. Read out your code at the door: ${ticket.ticketCode}`
		: "There is no pass for this ticket.";
}
