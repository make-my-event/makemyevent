import Link from "next/link";
import {
	BUSINESS,
	PAID_TICKET_FEE,
	PAID_TICKET_FEE_TEXT,
} from "@/lib/business";
import { publicPageMetadata } from "@/lib/site";
import styles from "../../content.module.css";
import pricing from "./pricing.module.css";

export const metadata = publicPageMetadata({
	path: "/pricing",
	title: "Pricing",
	description: `Free events cost nothing on MakeMyEvent. Paid events pay ${PAID_TICKET_FEE_TEXT} per paid ticket, payment gateway fee included, with nothing upfront.`,
});

/** A worked example, in whole rupees. */
const EXAMPLE_PRICE = 500;
const EXAMPLE_FEE =
	(EXAMPLE_PRICE * PAID_TICKET_FEE.percent) / 100 + PAID_TICKET_FEE.fixedRupees;

function Tick() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="m5 12.5 4.5 4.5L19 7.5" />
		</svg>
	);
}

export default function PricingPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Simple, transparent pricing.</h1>
					<p className={styles.lede}>
						Nothing upfront and no monthly fee. Free events stay free, and paid
						events pay a small fee only on tickets actually sold.
					</p>
				</div>

				<div className={pricing.tiers}>
					<section className={pricing.tier} aria-labelledby="tier-free">
						<h2 id="tier-free" className={pricing.name}>
							Free events
						</h2>
						<p className={pricing.price}>
							<span className={pricing.amount}>₹0</span>
							<span className={pricing.unit}>always</span>
						</p>
						<p className={pricing.for}>
							For community events, meetups, workshops and college fests that
							don&rsquo;t charge for entry.
						</p>
						<ul className={pricing.features}>
							<li>
								<Tick />
								Event page with details, venue and schedule
							</li>
							<li>
								<Tick />
								Registration form built your way
							</li>
							<li>
								<Tick />A unique QR pass for every attendee
							</li>
							<li>
								<Tick />
								Check-in from any phone, even offline
							</li>
							<li>
								<Tick />
								Certificates of participation
							</li>
						</ul>
					</section>

					<section className={pricing.tier} aria-labelledby="tier-paid">
						<h2 id="tier-paid" className={pricing.name}>
							Paid events
						</h2>
						<p className={pricing.price}>
							<span className={pricing.amount}>{PAID_TICKET_FEE_TEXT}</span>
							<span className={pricing.unit}>per paid ticket sold</span>
						</p>
						<p className={pricing.for}>
							₹0 upfront. One platform fee that already includes the payment
							gateway charges, so there is nothing else to add.
						</p>
						<ul className={pricing.features}>
							<li>
								<Tick />
								Everything in Free events
							</li>
							<li>
								<Tick />
								UPI, cards, net banking and wallets through Cashfree
							</li>
							<li>
								<Tick />
								Ticket revenue split and settled directly to your verified bank
								account
							</li>
							<li>
								<Tick />
								Free and paid ticket types in the same event
							</li>
							<li>
								<Tick />
								No fee on free tickets, even at a paid event
							</li>
						</ul>
					</section>
				</div>

				<div className={styles.column}>
					<div className={styles.body}>
						<h2>How payouts work</h2>
						<p>
							Attendees pay through Cashfree Payments, an RBI-authorised payment
							aggregator. Each payment is split automatically with Cashfree Easy
							Split: the platform fee is kept, and the rest of the ticket
							revenue is settled directly to the bank account of the Event
							Organiser, once Cashfree has verified them. MakeMyEvent never
							holds the organiser&rsquo;s share.
						</p>

						<h2>An example</h2>
						<p>
							On a ₹{EXAMPLE_PRICE} ticket the fee is {PAID_TICKET_FEE.percent}%
							of ₹{EXAMPLE_PRICE} plus ₹{PAID_TICKET_FEE.fixedRupees}, which is
							₹{EXAMPLE_FEE}. The attendee sees the ticket price and the fee
							before they pay.
						</p>

						<h2>Good to know</h2>
						<ul>
							<li>Prices are in Indian rupees (₹).</li>
							<li>
								Applicable taxes, if any, are charged as the law requires.
							</li>
							<li>
								Refunds follow our{" "}
								<Link href="/refund-policy">
									Refund &amp; Cancellation Policy
								</Link>
								. Organiser payout terms are in the{" "}
								<Link href="/terms-of-service">Terms of Service</Link>.
							</li>
							<li>
								Questions about pricing? Write to{" "}
								<a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> or{" "}
								<Link href="/contact">contact us</Link>.
							</li>
						</ul>
					</div>
				</div>
			</div>
		</main>
	);
}
