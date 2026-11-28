import { BUSINESS } from "@/lib/business";
import styles from "../content.module.css";

/**
 * Who runs the site, in the words of its registration. On the legal pages
 * only: the Udyam number is not repeated in the footer or elsewhere.
 */
export function BusinessDetails() {
	return (
		<dl className={styles.details}>
			<div>
				<dt>Business name</dt>
				<dd>{BUSINESS.name}</dd>
			</div>
			<div>
				<dt>Legal structure</dt>
				<dd>
					{BUSINESS.structure} owned by {BUSINESS.owner}
				</dd>
			</div>
			<div>
				<dt>Udyam Registration Number</dt>
				<dd translate="no">{BUSINESS.udyam}</dd>
			</div>
			<div>
				<dt>Registered office</dt>
				<dd>
					<address>
						{BUSINESS.address.lines.join(", ")},
						<br />
						{BUSINESS.address.region} - {BUSINESS.address.postcode},{" "}
						{BUSINESS.address.country}
					</address>
				</dd>
			</div>
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
		</dl>
	);
}
