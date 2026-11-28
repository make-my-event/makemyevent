import Link from "next/link";
import { ADDRESS_LINE, BUSINESS, PAID_TICKET_FEE_TEXT } from "@/lib/business";
import { publicPageMetadata } from "@/lib/site";
import styles from "../../content.module.css";

export const metadata = publicPageMetadata({
	path: "/about",
	title: "About",
	description:
		"Why MakeMyEvent exists, who owns and runs it, and what it costs to use.",
});

export default function AboutPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Built for the people who organise.</h1>
					<p className={styles.lede}>
						MakeMyEvent gives community organisers the ticketing tools that
						large conferences take for granted, without the cost or the setup.
					</p>

					<div className={styles.body}>
						<h2>Our mission</h2>
						<p>
							To make running an event, free or paid, as simple for a community
							organiser as it is for a large conference: a clear page, honest
							pricing, a ticket every attendee can trust, and money that reaches
							the organiser directly.
						</p>

						<h2>Why it exists</h2>
						<p>
							Most ticketing platforms are priced for events that sell thousands
							of seats. A college fest, a monthly meetup or a weekend workshop
							ends up on a spreadsheet and a group chat instead, and the
							organiser spends the morning of the event checking names off a
							printed list.
						</p>
						<p>
							The work is the same at any size. Someone has to publish the
							details, collect registrations, issue something each attendee can
							show at the door, and know who actually turned up. MakeMyEvent
							does those four things well and asks for nothing up front.
						</p>

						<h2>What it does</h2>
						<ul>
							<li>
								A shareable event page with the details, the venue and the
								registration form.
							</li>
							<li>
								A unique QR pass for every attendee, issued the moment they
								register.
							</li>
							<li>
								Check-in from any phone, which keeps working when the venue
								network does not.
							</li>
							<li>
								Certificates of participation for workshops and courses, once
								the event is over.
							</li>
						</ul>

						<h2>What it costs</h2>
						<p>
							Publishing an event page and taking free registrations costs
							nothing. Paid tickets carry one platform fee of{" "}
							{PAID_TICKET_FEE_TEXT} per ticket sold, with the payment gateway
							charges included. Payments run through Cashfree Payments, and card
							details are handled by Cashfree and never reach our servers. See{" "}
							<Link href="/pricing">pricing</Link> for the details.
						</p>

						<h2>Who we are</h2>
						<p>
							{BUSINESS.name}, a sole proprietorship founded by {BUSINESS.owner}
							, builds and runs makemyevent.org from Andhra Pradesh, India. If
							you organise events and something here does not fit how you work,
							that is worth telling us about.
						</p>
						<p>
							Registered office: {ADDRESS_LINE}, {BUSINESS.address.country}.
						</p>
						<p>
							Write to <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
							, or <Link href="/contact">get in touch</Link>.
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}
