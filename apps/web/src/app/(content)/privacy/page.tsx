import type { Metadata } from "next";
import styles from "../../content.module.css";

export const metadata: Metadata = {
	title: "Privacy policy",
	description:
		"What makemyevent collects, why, who else sees it, and how to have it removed.",
};

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
						Draft, last reviewed 15 November 2026
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

						<h2>Card details</h2>
						<p>
							We never see them. Payment forms are served directly by Stripe,
							and card numbers go from your browser to Stripe without passing
							through our servers.
						</p>

						<h2>Who else sees your data</h2>
						<ul>
							<li>
								<strong>The organiser of an event you registered for.</strong>{" "}
								They see your name, email address, answers to their questions,
								and whether you checked in. They cannot see events you
								registered for elsewhere.
							</li>
							<li>
								<strong>Stripe</strong>, for payments and payouts.
							</li>
							<li>
								<strong>Supabase</strong>, which hosts the database and handles
								sign-in.
							</li>
							<li>
								<strong>Nobody else.</strong> We do not sell personal data and
								we do not run advertising trackers.
							</li>
						</ul>

						<h2>Your QR pass</h2>
						<p>
							A pass is a signed token, not your account identifier. Someone who
							photographs it can present it at that one event and nothing else.
							Organisers can rotate the key for an event, which invalidates
							every pass issued before the rotation.
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
							We set cookies to keep you signed in and to remember whether you
							chose the light or the dark theme. There are no advertising or
							analytics cookies.
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
