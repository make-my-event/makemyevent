import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import shell from "../../event-shell.module.css";
import { loadManagedEvent } from "../../load-event";
import { Blocklist, type BlockedEntry } from "./blocklist";

export const metadata: Metadata = {
	title: "Blocklist",
	robots: { index: false, follow: false },
};

type Props = { params: Promise<{ event: string }> };

/**
 * The emails and phone numbers that can't register for this event, kept by
 * those who manage it. Volunteers don't see it: it isn't theirs to change.
 */
export default async function BlocklistPage({ params }: Props) {
	const { event: slug } = await params;
	const event = await loadManagedEvent(slug, "guests");
	if (event.role === "volunteer") notFound();

	const rows = await asUser(event.viewer, (tx) =>
		tx.blockedContact.findMany({
			where: { eventId: event.id },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			select: {
				id: true,
				kind: true,
				value: true,
				createdAt: true,
				by: { select: { displayName: true } },
			},
		}),
	);
	const entries: BlockedEntry[] = rows.map((row) => ({
		id: row.id.toString(),
		kind: row.kind === "phone" ? "phone" : "email",
		value: row.value,
		at: row.createdAt.toISOString(),
		by: row.by?.displayName ?? null,
	}));

	return (
		<main>
			<h2 className={shell.srOnly}>Blocklist</h2>
			<Blocklist
				eventId={event.id}
				entries={entries}
				guestsHref={`/dashboard/${encodeURIComponent(event.slug)}/guests`}
				timeZone={event.timeZone}
			/>
		</main>
	);
}
