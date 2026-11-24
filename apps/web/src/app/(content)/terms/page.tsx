import { publicPageMetadata } from "@/lib/site";
import styles from "../../content.module.css";

export const metadata = publicPageMetadata({
	path: "/terms",
	title: "Terms of service",
	description:
		"The rules for using makemyevent, for organisers and for attendees.",
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

export default function TermsPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Terms of service</h1>
					<p className={styles.lede}>
						What you can expect from makemyevent, and what we expect from you.
					</p>
					<p className={styles.updated}>
						Draft, last reviewed 15 November 2026
					</p>

					<div className={styles.callout}>
						<NoteIcon />
						<div>
							<p>
								This is a working draft that describes how the product behaves
								today. It has not yet been reviewed by a lawyer and is not yet a
								binding agreement.
							</p>
							<p>
								Before makemyevent takes its first paid registration this page
								must name the operating entity, the governing law, the limits of
								liability, and how disputes are settled.
							</p>
						</div>
					</div>

					<div className={styles.body}>
						<h2>Who these terms are for</h2>
						<p>
							Two groups use makemyevent. <strong>Organisers</strong> publish
							events and collect registrations. <strong>Attendees</strong>{" "}
							register for those events and receive a pass. Some sections apply
							to one group only, and say so.
						</p>

						<h2>Your account</h2>
						<p>
							You need an account to organise an event. You can register for a
							free event without one, and claim those tickets later by signing
							in with the same email address.
						</p>
						<p>
							Keep control of the email address and the Google account you sign
							in with, because anyone who controls them controls your account.
							Organiser and administrator accounts must have a second factor
							turned on.
						</p>

						<h2>For organisers</h2>
						<ul>
							<li>
								Your event must be real, and the page must describe it
								accurately. Date, venue, price and what a ticket includes must
								all be correct.
							</li>
							<li>
								You are responsible for running the event, for refunds, and for
								anything you tell your attendees.
							</li>
							<li>
								The registration list is yours to use for that event. Using it
								for unrelated marketing, or passing it to anyone else, is not
								allowed.
							</li>
							<li>
								You may only upload a cover image you have the right to use.
							</li>
							<li>
								Events that are illegal where they take place, that mislead
								attendees, or that exist to collect payment without delivering
								anything, will be taken down.
							</li>
						</ul>

						<h2>For attendees</h2>
						<ul>
							<li>
								Your pass admits you once. Copying it, selling it, or passing it
								to someone else may mean you are refused entry.
							</li>
							<li>
								Your agreement about the event itself is with the organiser, not
								with us. Refunds, cancellations and what happens on the day are
								theirs to decide.
							</li>
							<li>
								If an organiser cancels, they are responsible for refunding you.
								We will help you reach them.
							</li>
						</ul>

						<h2>Money</h2>
						<p>
							Publishing an event page and taking free registrations costs
							nothing. Paid ticketing runs through Stripe, which charges its own
							processing fee and pays organisers directly. We do not hold your
							money.
						</p>
						<p>
							Refunds are issued by the organiser through makemyevent, and
							arrive back on the card that paid.
						</p>

						<h2>What we provide</h2>
						<p>
							We work to keep makemyevent available and correct, particularly
							during an event. We cannot promise it will never be unavailable.
							Check-in keeps working without a network connection for exactly
							this reason.
						</p>
						<p>
							If we have to change or withdraw a feature you depend on, we will
							give you notice before an event that uses it.
						</p>

						<h2>Ending it</h2>
						<p>
							You can close your account at any time. We may suspend an account
							that breaks these terms, and will say why. Where an event is
							already selling tickets, we will tell the attendees what is
							happening.
						</p>

						<h2>Questions</h2>
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
