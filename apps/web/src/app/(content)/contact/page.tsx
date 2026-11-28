import { BUSINESS } from "@/lib/business";
import { publicPageMetadata } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import styles from "../../content.module.css";
import { ContactForm } from "./contact-form";
import contact from "./contact.module.css";

export const metadata = publicPageMetadata({
	path: "/contact",
	title: "Contact",
	description:
		"Reach MakeMyEvent by email, phone or the contact form. Registered office in Nandyal, Andhra Pradesh.",
});

export default function ContactPage() {
	return (
		<main className={styles.page}>
			<div className={styles.inner}>
				<div className={styles.column}>
					<h1 className={styles.h1}>Contact us</h1>
					<p className={styles.lede}>
						Questions about a ticket, a refund or running your event. We reply
						within {BUSINESS.responseHours} hours.
					</p>
				</div>

				<div className={contact.layout}>
					<section aria-labelledby="contact-form-title">
						<h2 id="contact-form-title" className={contact.heading}>
							Send a message
						</h2>
						<ContactForm siteKey={turnstileSiteKey()} />
					</section>

					<section aria-labelledby="contact-details-title">
						<h2 id="contact-details-title" className={contact.heading}>
							Reach us directly
						</h2>
						<dl className={contact.details}>
							<div>
								<dt>Email</dt>
								<dd>
									<a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
								</dd>
							</div>
							<div>
								<dt>Phone</dt>
								<dd>
									<a href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>
								</dd>
							</div>
							<div>
								<dt>Business hours</dt>
								<dd>{BUSINESS.hours}</dd>
							</div>
							<div>
								<dt>Registered office</dt>
								<dd>
									<address>
										{BUSINESS.name}
										<br />
										{BUSINESS.address.lines.map((line) => (
											<span key={line}>
												{line},
												<br />
											</span>
										))}
										{BUSINESS.address.region} - {BUSINESS.address.postcode}
										<br />
										{BUSINESS.address.country}
									</address>
								</dd>
							</div>
						</dl>
					</section>
				</div>
			</div>
		</main>
	);
}
