"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { JSX } from "react";

interface NavLink {
	label: string;
	href: string;
	/** Section id on this page; links with one are marked when in view. */
	sectionId?: string;
}

const LINKS: NavLink[] = [
	{ label: "Features", href: "#features", sectionId: "features" },
	{ label: "How it works", href: "#how", sectionId: "how" },
	{ label: "Events", href: "/events" },
];

const LINK_CLASS =
	"inline-flex min-h-11 items-center rounded-pill px-4 no-underline transition-colors duration-150 hover:bg-ink/15 motion-reduce:transition-none";

/**
 * Landing header links (md and up). Marks the section currently in view
 * with aria-current, as in the spec's scroll spy.
 */
export function LandingNavLinks(): JSX.Element {
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		if (!("IntersectionObserver" in window)) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
					} else {
						setActiveId((current) =>
							current === entry.target.id ? null : current,
						);
					}
				}
			},
			{ rootMargin: "-40% 0px -55% 0px" },
		);
		for (const link of LINKS) {
			const section = link.sectionId
				? document.getElementById(link.sectionId)
				: null;
			if (section) observer.observe(section);
		}
		return () => observer.disconnect();
	}, []);

	return (
		<nav aria-label="Main" className="mx-auto hidden gap-1 md:flex">
			{LINKS.map((link) => {
				const isCurrent =
					link.sectionId !== undefined && link.sectionId === activeId;
				return (
					<Link
						key={link.href}
						href={link.href}
						aria-current={isCurrent ? "true" : undefined}
						className={`${LINK_CLASS} ${isCurrent ? "bg-ink/15" : ""}`}
					>
						{link.label}
					</Link>
				);
			})}
		</nav>
	);
}
