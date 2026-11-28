import Link from "next/link";
import { BUSINESS, OWNERSHIP } from "@/lib/business";
import { publicPageMetadata } from "@/lib/site";
import styles from "../../content.module.css";
import { BusinessDetails } from "../business-details";

export const metadata = publicPageMetadata({
	path: "/refund-policy",
	title: "Refund & Cancellation Policy",
	description:
		"When a MakeMyEvent ticket is refunded, how long it takes, and how to raise a dispute.",
});

export default function RefundPolicyPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Refund &amp; Cancellation Policy</h1>
					<p className={styles.lede}>
						When you get your money back, how long it takes, and who to ask.
					</p>
					<p className={styles.updated}>Last updated 28 November 2026</p>

					<div className={styles.body}>
						<h2>How MakeMyEvent works</h2>
						<p>
							MakeMyEvent, run by {OWNERSHIP}, is an online event ticketing and
							registration platform. Events listed on it are organised by
							independent third-party Event Organisers. When you buy a ticket,
							the payment is collected through our payment partner, Cashfree
							Payments, and the ticket proceeds are settled to the Event
							Organiser. This policy sets out when a ticket is refunded and how.
						</p>

						<h2>Event cancellation or postponement</h2>
						<p>
							If an Event Organiser cancels an event, or reschedules it to a
							different date, you are eligible for a{" "}
							<strong>100% refund of the ticket face value</strong>.
						</p>
						<ul>
							<li>
								For a cancelled event, the refund is started automatically. You
								do not need to ask for it.
							</li>
							<li>
								For a rescheduled event, your ticket stays valid for the new
								date. If you cannot attend it, ask for a refund before the event
								starts on the new date.
							</li>
							<li>
								Refunds are processed back to the original payment method within{" "}
								<strong>5–7 business days</strong>. Your bank may take a little
								longer to show it on your statement.
							</li>
						</ul>

						<h2>Cancelling your own ticket</h2>
						<ul>
							<li>
								Whether you can cancel a ticket yourself, and how much is
								refunded, is decided by the Event Organiser&rsquo;s cancellation
								policy, stated on the event page. Read it before you buy.
							</li>
							<li>
								Where the event page states no cancellation policy, tickets
								cannot be cancelled by the attendee, except as described above.
							</li>
							<li>
								The platform convenience fee and payment gateway fee are
								non-refundable once a ticket has been issued.
							</li>
							<li>
								An approved refund is processed back to the original payment
								method within 5–7 business days.
							</li>
						</ul>

						<h2>Failed or duplicate payments</h2>
						<p>
							If money left your account but no ticket was issued, or you were
							charged twice for the same order, the amount is returned to the
							original payment method in full, usually within 5–7 business days.
							Write to us with your payment reference if it has not arrived by
							then.
						</p>

						<h2>Free events</h2>
						<p>
							Free tickets involve no payment, so there is nothing to refund.
							You can ask the organiser to remove your registration at any time.
						</p>

						<h2>Disputes and support</h2>
						<p>
							If a refund has not arrived, was refused, or you think it is
							wrong, write to us before raising a chargeback with your bank.
							Include the email address you bought with and the order or payment
							reference.
						</p>
						<ul>
							<li>
								Email: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
							</li>
							<li>
								Phone: <a href={BUSINESS.phoneHref}>{BUSINESS.phone}</a> (
								{BUSINESS.hours})
							</li>
							<li>
								Or use the <Link href="/contact">contact form</Link>.
							</li>
						</ul>
						<p>
							We respond to every refund and dispute request within{" "}
							<strong>{BUSINESS.responseHours} hours</strong>, and work with the
							Event Organiser and Cashfree to resolve it.
						</p>
						<BusinessDetails />
					</div>
				</div>
			</div>
		</main>
	);
}
