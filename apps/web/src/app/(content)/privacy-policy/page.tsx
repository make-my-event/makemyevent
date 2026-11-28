import Link from "next/link";
import { BUSINESS, OWNERSHIP } from "@/lib/business";
import { publicPageMetadata } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import styles from "../../content.module.css";
import { BusinessDetails } from "../business-details";

export const metadata = publicPageMetadata({
	path: "/privacy-policy",
	title: "Privacy Policy",
	description:
		"What MakeMyEvent collects when you register, buy a ticket or organise an event, who else sees it, and how to have it removed.",
});

/**
 * Says what the code does: a service is named here in the change that starts
 * using it, and what it is given is what is really sent to it.
 */
export default function PrivacyPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Privacy Policy</h1>
					<p className={styles.lede}>
						What we collect, why we collect it, and what you can ask us to do
						with it.
					</p>
					<p className={styles.updated}>Last updated 28 November 2026</p>

					<div className={styles.body}>
						<h2>Who we are</h2>
						<p>
							makemyevent.org is run by {OWNERSHIP}. In this policy
							&ldquo;we&rdquo; and &ldquo;us&rdquo; mean {BUSINESS.name}. We are
							responsible for the personal data described here, under the
							Information Technology Act, 2000, the rules made under it, and the
							Digital Personal Data Protection Act, 2023.
						</p>
						<BusinessDetails />

						<h2>What we collect</h2>
						<h3>When you register for an event</h3>
						<p>
							Your name and email address, the event you registered for, and
							anything the organiser asked for on their own form, which may
							include a phone number. You can register for an event without an
							account.
						</p>
						<h3>When you buy a paid ticket</h3>
						<p>
							The ticket, the amount and the currency, and the order and payment
							references Cashfree returns to us. Cashfree also needs your phone
							number and email address to process the payment.
						</p>
						<h3>When an organiser adds you</h3>
						<p>
							Organisers can add guests themselves, one at a time or from a
							file. We then hold what they entered: your name, your email
							address and answers to their form. They can also block an email
							address or phone number from registering, and we keep it for that.
						</p>
						<h3>When you create an account</h3>
						<p>
							Your email address, and the name and profile picture Google gives
							us if you sign in with Google. We do not store passwords, because
							there are none. Signing in happens through Google or through a
							one-time link sent to your email.
						</p>
						<h3>When you organise an event</h3>
						<p>
							The event details you publish, the cover image you upload, and the
							registration list for that event. To receive money from paid
							tickets you give your identity and bank account details, which
							Cashfree verifies before it settles anything to you. We keep only
							what we need to identify your payout account and reconcile what
							was paid.
						</p>
						<h3>When you write to us</h3>
						<p>
							Your name, your email address and your message, whether you use
							the contact form or email. We use them to answer you.
						</p>
						<h3>Automatically</h3>
						<p>
							Server logs with the request path, a request identifier, a
							timestamp and an approximate location derived from the network
							address. These are used to find faults and to spot abuse.
						</p>
						<p>
							To stop abuse we also count how often something is done. Your
							email address and network address are scrambled before they are
							counted, and a count is kept for a day at most.
						</p>

						<h2>Payments and card details</h2>
						<p>
							Payments for paid tickets are processed by Cashfree Payments India
							Private Limited, a payment aggregator authorised by the Reserve
							Bank of India. You enter your card, UPI or bank details on
							Cashfree&rsquo;s own checkout, and they go from your browser to
							Cashfree without passing through our servers. We never see or
							store card numbers, CVVs, UPI PINs or net banking passwords.
						</p>
						<p>
							Cashfree splits each payment and settles the organiser&rsquo;s
							share directly to the organiser&rsquo;s verified bank account.
							Cashfree handles the data it is given under its own privacy
							policy, as well as ours.
						</p>

						<h2>Your QR ticket</h2>
						<p>
							A ticket&rsquo;s QR code is a signed token, not your account
							identifier. Someone who photographs it can present it at that one
							event and nothing else. The key that signs an event&rsquo;s
							tickets can be changed, which invalidates every ticket issued
							before the change.
						</p>
						<p>
							When your ticket is scanned at the door, the organiser&rsquo;s
							staff see your name and ticket type, and we record the time it was
							checked in.
						</p>

						<h2>Who else sees your data</h2>
						<ul>
							<li>
								<strong>The organiser of an event you are a guest of,</strong>{" "}
								and the team they choose. They see your name, email address,
								answers to their questions, what you paid, and whether you
								checked in. They cannot see your registrations for other
								people&rsquo;s events.
							</li>
							<li>
								<strong>Cashfree Payments</strong>, which processes payments for
								paid tickets and settles organisers&rsquo; payouts.
							</li>
							<li>
								<strong>Vercel</strong>, which runs the website. Every request
								passes through it, with your network address.
							</li>
							<li>
								<strong>Supabase</strong>, which holds the database and uploaded
								images, and handles sign-in.
							</li>
							<li>
								<strong>Resend</strong>, which delivers our email. It is given
								your email address and what the email says. For a ticket, that
								is your name, the event, and your ticket with its QR code.
							</li>
							<li>
								<strong>Upstash</strong>, which holds the counts that stop
								abuse, with the scrambled addresses described above.
							</li>
							<li>
								<strong>Google</strong>, if you sign in with it.
							</li>
							{turnstileSiteKey() ? (
								<li>
									<strong>Cloudflare</strong>, when you open the sign-in page or
									the contact form. Its Turnstile check tells people from bots,
									and sees your network address and details about your browser
									to do it.
								</li>
							) : null}
							<li>
								<strong>OpenFreeMap</strong> and <strong>komoot</strong>, when
								an organiser sets a venue. OpenFreeMap draws the map and sees
								their network address. komoot looks up the place they type, and
								sees only our server.
							</li>
						</ul>
						<p>
							These services work for us or for the organiser. Some of them
							store data outside India. We do not sell personal data and we do
							not run advertising trackers. We disclose data to a government
							authority only where Indian law requires it.
						</p>

						<h2>How long we keep it</h2>
						<ul>
							<li>Your account, for as long as you keep it open.</li>
							<li>
								Registrations and check-ins, for as long as the organiser keeps
								the event, or until you or they remove them.
							</li>
							<li>
								Orders, payments, refunds and payouts, for as long as Indian tax
								and accounting law requires, even after an account is closed.
							</li>
							<li>
								Abuse counts, for a day at most. Server logs, for as long as
								they are needed to investigate faults and abuse.
							</li>
						</ul>

						<h2>What you can ask for</h2>
						<ul>
							<li>A summary of the data held about you.</li>
							<li>Correction of anything that is wrong or incomplete.</li>
							<li>
								Deletion of your account. Records tied to a completed paid
								transaction are kept where the law requires it.
							</li>
							<li>
								Removal from a single organiser&rsquo;s registration list, which
								we pass on to that organiser.
							</li>
							<li>Someone to act for you on these rights if you cannot.</li>
						</ul>
						<p>
							Write to <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>{" "}
							or use the <Link href="/contact">contact form</Link>. We
							acknowledge every request within {BUSINESS.responseHours} hours
							and complete it within 30 days.
						</p>

						<h2>Grievance Officer</h2>
						<p>
							Complaints about how your data is handled go to our Grievance
							Officer, {BUSINESS.owner}, at{" "}
							<a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> or{" "}
							<a href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>, or by post to
							the registered office above. If you are not satisfied with our
							answer, you may complain to the Data Protection Board of India.
						</p>

						<h2>Security</h2>
						<p>
							Data is encrypted in transit and at rest. Each person can reach
							only the records they are entitled to, which the database itself
							enforces. Organisers must turn on a second sign-in factor once
							people register for their event.
						</p>

						<h2>Cookies</h2>
						<p>
							We set cookies to keep you signed in, to bring you back to the
							page you were on, and to remember choices you make in the
							dashboard. Your light or dark theme is remembered in your browser.
							There are no advertising or analytics cookies.
						</p>

						<h2>Governing law</h2>
						<p>
							This policy is governed by the laws of India. Disputes about it
							are subject to the exclusive jurisdiction of the courts at{" "}
							{BUSINESS.courts}.
						</p>

						<h2>Changes</h2>
						<p>
							When this policy changes in a way that affects you, we will say so
							on this page and date the change. The date at the top is always
							the date of the current version.
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}
