import Link from "next/link";
import { BUSINESS, OWNERSHIP, PAID_TICKET_FEE_TEXT } from "@/lib/business";
import { publicPageMetadata } from "@/lib/site";
import styles from "../../content.module.css";
import { BusinessDetails } from "../business-details";

export const metadata = publicPageMetadata({
	path: "/terms-of-service",
	title: "Terms of Service",
	description:
		"The rules for using MakeMyEvent, for event organisers and for attendees, including payouts, fees and prohibited events.",
});

export default function TermsPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Terms of Service</h1>
					<p className={styles.lede}>
						What you can expect from MakeMyEvent, and what we expect from you.
					</p>
					<p className={styles.updated}>Last updated 28 November 2026</p>

					<div className={styles.body}>
						<h2>Who we are</h2>
						<p>
							makemyevent.org is an online event ticketing and registration
							platform run by {OWNERSHIP}. In these terms &ldquo;we&rdquo; and
							&ldquo;us&rdquo; mean {BUSINESS.name}. By using the site you agree
							to these terms, to the{" "}
							<Link href="/privacy-policy">Privacy Policy</Link> and to the{" "}
							<Link href="/refund-policy">
								Refund &amp; Cancellation Policy
							</Link>
							.
						</p>
						<BusinessDetails />

						<h2>Who these terms are for</h2>
						<p>
							Two groups use MakeMyEvent. <strong>Organisers</strong> publish
							events, collect registrations and sell tickets.{" "}
							<strong>Attendees</strong> register for those events, buy tickets
							and receive a QR ticket. Some sections apply to one group only,
							and say so.
						</p>
						<p>
							We provide the platform. Each event is organised by its organiser,
							who is a third party and not us. Your agreement about the event
							itself (what happens on the day, who may enter, what a ticket
							includes) is with the organiser.
						</p>

						<h2>Your account</h2>
						<p>
							You need an account to organise an event. You can register for an
							event or buy a ticket without one, and claim those tickets later
							by signing in with the same email address.
						</p>
						<p>
							Keep control of the email address and the Google account you sign
							in with, because anyone who controls them controls your account.
							Organisers must turn on a second sign-in factor once people
							register for their event. You must be at least 18 years old, or
							use the site with a parent or guardian&rsquo;s consent.
						</p>

						<h2>For event organisers</h2>
						<h3>Your event</h3>
						<ul>
							<li>
								Your event must be real, and the page must describe it
								accurately. Date, time, venue, price, what a ticket includes and
								your cancellation policy must all be correct and kept current.
							</li>
							<li>
								You are responsible for delivering the event as described, and
								for the safety, permissions and licences it needs.
							</li>
							<li>
								You are responsible for anything you tell your attendees, and
								for answering their questions about the event.
							</li>
							<li>
								The registration list is yours to use for that event. Using it
								for unrelated marketing, or passing it to anyone else, is not
								allowed.
							</li>
							<li>
								You may only upload a cover image and text you have the right to
								use.
							</li>
						</ul>

						<h3>Payouts and split settlement</h3>
						<ul>
							<li>
								To sell paid tickets you complete verification with our payment
								partner, Cashfree Payments, including your identity and the bank
								account payouts go to. Paid tickets can be sold only once you
								are verified.
							</li>
							<li>
								Attendees pay through Cashfree. Each payment is split: our
								platform fee of {PAID_TICKET_FEE_TEXT} per paid ticket, which
								includes payment gateway charges, is kept, and the rest of the
								ticket revenue is settled directly to your verified bank account
								through Cashfree Easy Split. We do not hold your share.
							</li>
							<li>
								Settlement follows Cashfree&rsquo;s settlement cycle. We may
								hold a settlement while a payment is disputed, while a refund is
								owed, or while we review an event under these terms.
							</li>
							<li>
								Applicable taxes, if any, are charged as the law requires. You
								are responsible for the taxes on your own ticket revenue,
								including GST where you are registered for it.
							</li>
						</ul>

						<h3>Cancellations, refunds and chargebacks</h3>
						<ul>
							<li>
								If you cancel or reschedule an event, attendees are entitled to
								a refund of the ticket face value, as set out in the{" "}
								<Link href="/refund-policy">
									Refund &amp; Cancellation Policy
								</Link>
								. You bear that cost. Where it has already been settled to you,
								we may recover it from your future settlements or ask you to
								repay it.
							</li>
							<li>
								Your own cancellation policy for attendees must be stated on the
								event page, and you must honour it.
							</li>
							<li>
								Chargebacks and disputes raised on your event are your
								responsibility. We will share what we hold to help you answer
								them.
							</li>
						</ul>

						<h3>Prohibited events</h3>
						<p>You may not use MakeMyEvent for events or tickets that:</p>
						<ul>
							<li>
								are illegal in India or where they take place, or lack a licence
								or permission they need;
							</li>
							<li>
								involve gambling, betting, lotteries or games of chance for
								money;
							</li>
							<li>
								sell or promote drugs, tobacco, alcohol (where not licensed),
								weapons, explosives or other restricted goods;
							</li>
							<li>
								are adult or sexually explicit, or involve the exploitation of
								anyone;
							</li>
							<li>
								promote hatred, violence or discrimination against any group;
							</li>
							<li>
								are pyramid or multi-level marketing schemes, or collect money
								for cryptocurrency or investment schemes;
							</li>
							<li>
								infringe someone else&rsquo;s trademark, copyright or other
								rights, or resell tickets to another organiser&rsquo;s event
								without their permission;
							</li>
							<li>
								mislead attendees, or exist to collect payment without
								delivering anything.
							</li>
						</ul>
						<p>
							We may take down such an event, refund its attendees, hold its
							settlements and close the organiser&rsquo;s account, and we report
							illegal activity to the authorities where the law requires it.
						</p>

						<h2>For attendees</h2>
						<ul>
							<li>
								Your QR ticket admits you once. Copying it, selling it, or
								passing it to someone else may mean you are refused entry.
							</li>
							<li>
								When you buy a paid ticket you see the ticket price and the
								platform fee before you pay. Payment is taken by Cashfree, and
								your ticket is issued once Cashfree confirms the payment.
							</li>
							<li>
								Refunds are covered by the{" "}
								<Link href="/refund-policy">
									Refund &amp; Cancellation Policy
								</Link>
								.
							</li>
							<li>
								Follow the organiser&rsquo;s rules and the venue&rsquo;s rules
								on the day.
							</li>
						</ul>

						<h2>What we provide</h2>
						<p>
							We work to keep MakeMyEvent available and correct, particularly
							during an event. We cannot promise it will never be unavailable.
							Check-in keeps working without a network connection for exactly
							this reason.
						</p>
						<p>
							If we have to change or withdraw a feature you depend on, we will
							give you notice before an event that uses it.
						</p>

						<h2>Limits of our liability</h2>
						<p>
							We are not the organiser of any event, and are not liable for how
							an event is run, for its cancellation, or for anything that
							happens at it. To the extent the law allows, our total liability
							to you for any claim is limited to the platform fees we received
							from you in the twelve months before the claim. Nothing in these
							terms limits liability that cannot be limited under Indian law.
						</p>
						<p>
							You agree to compensate us for losses caused by your breach of
							these terms or by an event you organise.
						</p>

						<h2>Ending it</h2>
						<p>
							You can close your account at any time. We may suspend an account
							that breaks these terms, and will say why. Where an event is
							already selling tickets, we will tell the attendees what is
							happening.
						</p>

						<h2>Governing law and disputes</h2>
						<p>
							These terms are governed by the laws of India. Before going to
							court, write to us at{" "}
							<a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> and we
							will try to settle the matter with you. We reply within{" "}
							{BUSINESS.responseHours} hours. Any dispute that remains is
							subject to the exclusive jurisdiction of the courts at{" "}
							{BUSINESS.courts}.
						</p>

						<h2>Changes</h2>
						<p>
							When these terms change in a way that affects you, we will say so
							on this page and date the change. Using the site after that means
							you accept the new terms.
						</p>

						<h2>Questions</h2>
						<p>
							Write to <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
							, call <a href={BUSINESS.phoneHref}>{BUSINESS.phone}</a> (
							{BUSINESS.hours}
							), or use the <Link href="/contact">contact form</Link>.
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}
