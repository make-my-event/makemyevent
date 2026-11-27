import {
	answerText,
	type FormField,
	readForm,
	renderPass,
} from "@makemyevent/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { asVisitor } from "@/lib/db";
import { whereText } from "@/lib/event-text";
import { designOf, eventPassValues } from "@/lib/pass";
import { PAGE_PASS_FONTS } from "@/lib/pass-fonts";
import { masterKey, readView, signPass } from "@/lib/pass-token";
import { qrModules, qrSvg } from "@/lib/qr";
import { limited } from "@/lib/rate-limit";
import { CopyCode } from "./copy-code";
import { ShowCode } from "./show-code";
import styles from "./ticket.module.css";

export const metadata: Metadata = {
	title: "Your ticket",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }> };

/** What app.ticket_view returns (the ticket_view migration). */
type View = {
	attendeeName: string;
	ticketCode: string;
	status: "confirmed" | "waitlisted" | "cancelled" | string;
	ticketName: string;
	design: { base: string; accent: string | null; layers: unknown } | null;
	event: {
		title: string;
		startsAt: string | null;
		endsAt: string | null;
		timeZone: string | null;
		format: string;
		venueName: string | null;
		venueAddress: string | null;
		keyVersion: number;
	};
	questions: unknown[];
	answers: Record<string, { value: unknown; otherText: string | null }>;
};

/** A day after the event ends, the code no longer lets anyone in. */
const AFTER_MS = 24 * 60 * 60 * 1000;

function endedAt(event: View["event"]): number | null {
	const last = event.endsAt ?? event.startsAt;
	return last ? new Date(last).getTime() + AFTER_MS : null;
}

/**
 * A guest's ticket, from the signed link in their pass email: the pass in
 * its ticket's design, the ticket code to copy, and when and where. Anyone
 * with the link sees it, as anyone with the email does; the link only
 * shows the ticket, and the code on it lets them in.
 *
 *   ┌ the pass, large ───────────────────────┐ ┌ Ticket code [Copy] ┐
 *   │                                        │ │ When, where        │
 *   └────────────────────────────────────────┘ └────────────────────┘
 *
 * The pass's own code is small on a phone: "Show code to scan" opens it
 * large, for the door. A day after the event, cancelled, or reissued: the pass
 * stays, its code is retired, and the page says why.
 */
export default async function TicketPage({ params }: Props) {
	const { token } = await params;
	const master = masterKey();
	const claims = master ? readView(master, decodeURIComponent(token)) : null;
	if (!master || !claims) notFound();

	const slow = await limited("ticket.view", {});
	if (slow)
		return (
			<Shell>
				<p className={styles.notice} role="alert">
					{slow.message}
				</p>
			</Shell>
		);

	const view = await asVisitor(async (tx) => {
		const rows = await tx.$queryRaw<{ v: View | null }[]>`
			SELECT app.ticket_view(${claims.registrationId}::uuid, ${claims.eventId}::uuid) AS v`;
		return rows[0]?.v ?? null;
	});
	if (!view) notFound();

	const reissued = view.event.keyVersion !== claims.version;
	const ends = endedAt(view.event);
	const ended = ends !== null && Date.now() > ends;
	const why = reissued
		? "This ticket was reissued. Use the newest email from the event."
		: view.status === "cancelled"
			? "This ticket was cancelled."
			: view.status !== "confirmed"
				? "You're on the waiting list. You'll get a new email if you get a place."
				: ended
					? "This event has ended."
					: null;
	const live = why === null;

	// The answers the design prints, as words.
	const read = readForm(view.questions);
	const fields: FormField[] = read.ok ? read.fields : [];
	const answers: Record<string, string> = {};
	for (const field of fields) {
		const answer = view.answers[field.id];
		if (answer)
			answers[field.id] = answerText(
				field,
				answer.value as Parameters<typeof answerText>[1],
				answer.otherText,
			);
	}

	const event = {
		...view.event,
		startsAt: view.event.startsAt ? new Date(view.event.startsAt) : null,
	};
	const entry = live ? signPass(master, claims) : null;
	const pass = renderPass({
		design: designOf(view.design),
		values: {
			...eventPassValues(event),
			ticket_name: view.ticketName,
			guest_name: view.attendeeName,
			ticket_code: live ? view.ticketCode : "",
			answers,
		},
		code: entry ? qrModules(entry) : null,
		retired: reissued
			? "Reissued"
			: view.status === "cancelled"
				? "Cancelled"
				: view.status !== "confirmed"
					? "Waiting\nlist"
					: "Event\nended",
		fonts: PAGE_PASS_FONTS,
		uid: "ticket",
		title: `${view.attendeeName}'s ${view.ticketName} ticket for ${view.event.title}`,
	});
	const where = whereText(event);
	const date = eventPassValues(event);

	return (
		<Shell>
			<h1 className={styles.srOnly}>Your ticket for {view.event.title}</h1>
			<div className={styles.layout}>
				<section className={styles.stage} aria-label="Pass">
					<div
						className={styles.pass}
						data-retired={live ? undefined : true}
						// Drawn by renderPass: every word escaped, the artwork ours.
						// biome-ignore lint/security/noDangerouslySetInnerHtml: see above
						dangerouslySetInnerHTML={{ __html: pass }}
					/>
				</section>

				<aside className={styles.side}>
					{why ? (
						<p className={styles.notice} role="status">
							{why}
						</p>
					) : null}

					{live ? (
						<div className={styles.block}>
							<p className={styles.label} id="code-label">
								Ticket code
							</p>
							<CopyCode code={view.ticketCode} />
							{entry ? (
								<ShowCode
									svg={await qrSvg(entry)}
									code={view.ticketCode}
									name={view.attendeeName}
								/>
							) : null}
							<p className={styles.hint}>
								Show the code on your pass at the door. If it won't scan, read
								out this code.
							</p>
						</div>
					) : null}

					<dl className={styles.facts}>
						<div>
							<dt>Event</dt>
							<dd>{view.event.title}</dd>
						</div>
						<div>
							<dt>Ticket</dt>
							<dd>{view.ticketName}</dd>
						</div>
						<div>
							<dt>When</dt>
							<dd>
								{event.startsAt ? (
									<time dateTime={event.startsAt.toISOString()}>
										{date.event_date}, {date.event_time}
									</time>
								) : (
									"Date to be announced"
								)}
							</dd>
						</div>
						{where ? (
							<div>
								<dt>Where</dt>
								<dd>{where}</dd>
							</div>
						) : null}
					</dl>

					<p className={styles.hint}>
						This page is your ticket. Don't share its link.
					</p>
				</aside>
			</div>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<>
			<SiteHeader />
			<main className={styles.page}>{children}</main>
		</>
	);
}
