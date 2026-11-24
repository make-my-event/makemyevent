import type { Metadata } from "next";
import styles from "../../content.module.css";

export const metadata: Metadata = {
	title: "About",
	description:
		"Why makemyevent exists, who builds it, and what it costs to use.",
};

export default function AboutPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Built for the people who organise.</h1>
					<p className={styles.lede}>
						makemyevent gives community organisers the ticketing tools that
						large conferences take for granted, without the cost or the setup.
					</p>

					<div className={styles.body}>
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
							show at the door, and know who actually turned up. makemyevent
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
							nothing. Paid ticketing runs through Stripe, which charges its own
							processing fee on each sale. Card details are handled by Stripe
							and never reach our servers.
						</p>

						<h2>Who builds it</h2>
						<p>
							makemyevent is built and run by a small independent team. If you
							organise events and something here does not fit how you work, that
							is worth telling us about.
						</p>
						<p>
							Write to{" "}
							<a href="mailto:admin@makemyevent.org">admin@makemyevent.org</a>.
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}
