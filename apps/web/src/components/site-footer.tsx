import { Brand } from "./brand";
import styles from "./site-footer.module.css";

const COLUMNS = [
	{
		heading: "Product",
		links: [
			{ label: "Features", href: "/#features" },
			{ label: "How it works", href: "/#how-it-works" },
			{ label: "Pricing", href: "/#pricing" },
		],
	},
	{
		heading: "Company",
		links: [
			{ label: "About", href: "/about" },
			{ label: "Contact", href: "mailto:admin@makemyevent.org" },
		],
	},
	{
		heading: "Legal",
		links: [
			{ label: "Privacy policy", href: "/privacy" },
			{ label: "Terms of service", href: "/terms" },
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
										<a className={styles.link} href={link.href}>
											{link.label}
										</a>
									</li>
								))}
							</ul>
						</nav>
					))}
				</div>

				<div className={styles.base}>
					<span>© {new Date().getFullYear()} makemyevent</span>
					<span>Sample events and names on this page are illustrative.</span>
				</div>
			</div>
		</footer>
	);
}
