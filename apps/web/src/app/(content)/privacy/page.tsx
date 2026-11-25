import { publicPageMetadata } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import styles from "../../content.module.css";

export const metadata = publicPageMetadata({
	path: "/privacy",
	title: "Privacy policy",
	description:
		"What makemyevent collects, why, who else sees it, and how to have it removed.",
});

function NoteIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7.75v5.5M12 16.4h.01" />
		</svg>
	);
}

/**
 * Says what the code does today: a service is named here in the change that
 * starts using it, and what it is given is what is really sent to it.
 */
export default function PrivacyPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Privacy policy</h1>
					<p className={styles.lede}>
						What we collect, why we collect it, and what you can ask us to do
						with it.
					</p>
					<p className={styles.updated}>
						Draft, last reviewed 25 November 2026
					</p>

					<div className={styles.callout}>
						<NoteIcon />
						<div>
							<p>
								This is a working draft that describes how the product behaves
								today. It has not yet been reviewed by a lawyer.
							</p>
							<p>
								Before makemyevent takes its first paid registration this page
								must name the operating entity, the governing jurisdiction, how
								long each kind of record is kept, and a contact for data
								requests.
							</p>
						</div>
					</div>

					<div className={styles.body}>
						<h2>What we collect</h2>
						<h3>When you register for an event</h3>
						<p>
							Your name and email address, the event you registered for, and
							anything the organiser asked for on their own form. If the event
							is paid, we also store the amount, the currency and a payment
							reference from Stripe.
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
							registration list for that event. If you take payment, Stripe
							holds your payout details and we store only the identifiers needed
							to reconcile the money.
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

						<h2>Card details</h2>
						<p>
							We never see them. Payment forms are served directly by Stripe,
							and card numbers go from your browser to Stripe without passing
							through our servers.
						</p>

						<h2>Who else sees your data</h2>
						<ul>
							<li>
								<strong>The organiser of an event you are a guest of,</strong>{" "}
								and the team they choose. They see your name, email address,
								answers to their questions, and whether you checked in. They
								cannot see your registrations for other people&rsquo;s events.
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
								your email address and what the email says. For a pass, that is
								your name, the event, and your ticket with its QR code.
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
									<strong>Cloudflare</strong>, when you open the sign-in page.
									Its Turnstile check tells people from bots, and sees your
									network address and details about your browser to do it.
								</li>
							) : null}
							<li>
								<strong>OpenFreeMap</strong> and <strong>komoot</strong>, when
								an organiser sets a venue. OpenFreeMap draws the map and sees
								their network address. komoot looks up the place they type, and
								sees only our server.
							</li>
							<li>
								<strong>Stripe</strong>, for payments and payouts, once paid
								tickets are available. They are not yet.
							</li>
						</ul>
						<p>
							These services work for us or for the organiser. We do not sell
							personal data and we do not run advertising trackers.
						</p>

						<h2>Your QR pass</h2>
						<p>
							A pass is a signed token, not your account identifier. Someone who
							photographs it can present it at that one event and nothing else.
							The key that signs an event&rsquo;s passes can be changed, which
							invalidates every pass issued before the change.
						</p>

						<h2>What you can ask for</h2>
						<ul>
							<li>A copy of the data held about you.</li>
							<li>Correction of anything that is wrong.</li>
							<li>
								Deletion of your account. Records tied to a completed paid
								transaction are kept where the law requires it.
							</li>
							<li>
								Removal from a single organiser&rsquo;s registration list, which
								we pass on to that organiser.
							</li>
						</ul>
						<p>
							Write to{" "}
							<a href="mailto:admin@makemyevent.org">admin@makemyevent.org</a>{" "}
							and we will respond within 30 days.
						</p>

						<h2>Cookies</h2>
						<p>
							We set cookies to keep you signed in, to bring you back to the
							page you were on, and to remember choices you make in the
							dashboard. Your light or dark theme is remembered in your browser.
							There are no advertising or analytics cookies.
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
