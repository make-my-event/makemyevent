import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "../../dashboard.module.css";
import shell from "../event-shell.module.css";
import { loadManagedEvent } from "../load-event";
import { SECTION_LABELS } from "../sections";

type Props = { params: Promise<{ event: string; section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section } = await params;
	return {
		title: SECTION_LABELS[section] ?? "Not found",
		robots: { index: false, follow: false },
	};
}

/**
 * A sidebar section that has no page of its own yet. The sidebar lists every
 * section, so a link to one must not land on "not found"; it lands here,
 * behind the same gate as a real section, and says so plainly. Built
 * sections (overview, edit) have their own folders, which Next prefers to
 * this one. Anything not in the sidebar is still not found.
 */
export default async function UnbuiltSectionPage({ params }: Props) {
	const { event: slug, section } = await params;
	const label = SECTION_LABELS[section];
	if (!label) notFound();
	await loadManagedEvent(slug, section);

	return (
		<main>
			<h2 className={shell.srOnly}>{label}</h2>
			<div className={styles.empty}>
				<p className={styles.emptyTitle}>{label} is not built yet</p>
				<p className={styles.emptyBody}>
					It comes in a later step. The Overview has your event, its
					registrations and its team in the meantime.
				</p>
				<Link
					className={styles.emptyAction}
					href={`/dashboard/${encodeURIComponent(slug)}/overview`}
				>
					Go to Overview
				</Link>
			</div>
		</main>
	);
}
