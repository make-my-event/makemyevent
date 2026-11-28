import Link from "next/link";
import { ADDRESS_LINE, BUSINESS } from "@/lib/business";
import { Brand } from "./brand";
import styles from "./site-footer.module.css";

const COLUMNS = [
	{
		heading: "Product",
		links: [
			{ label: "Features", href: "/#features" },
			{ label: "How it works", href: "/#how-it-works" },
			{ label: "Pricing", href: "/pricing" },
		],
	},
	{
		heading: "Company",
		links: [
			{ label: "About", href: "/about" },
			{ label: "Contact", href: "/contact" },
		],
	},
	{
		heading: "Legal",
		links: [
			{ label: "Privacy Policy", href: "/privacy-policy" },
			{ label: "Terms of Service", href: "/terms-of-service" },
			{ label: "Refund & Cancellation Policy", href: "/refund-policy" },
		],
	},
];

export function SiteFooter() {
	return (
		<footer className={styles.footer}>
			<div className={styles.inner}>
				<div className={styles.grid}>
					<div className={styles.about}>
						<Brand />
						<p className={styles.tagline}>
							Making events easier to organise and better to experience.
						</p>
					</div>

					{COLUMNS.map((column) => (
						<nav key={column.heading} aria-label={column.heading}>
							<h2 className={styles.heading}>{column.heading}</h2>
							<ul className={styles.list}>
								{column.links.map((link) => (
									<li key={link.label}>
										<Link className={styles.link} href={link.href}>
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</nav>
					))}
				</div>

				<div className={styles.base}>
					<p className={styles.legal}>
						© {new Date().getFullYear()} {BUSINESS.name}. Owned and operated by{" "}
						{BUSINESS.owner} ({BUSINESS.structure}). Registered Office:{" "}
						{ADDRESS_LINE}.
					</p>
					<p className={styles.legal}>
						Sample events and names on this page are illustrative.
					</p>
				</div>
			</div>
		</footer>
	);
}
