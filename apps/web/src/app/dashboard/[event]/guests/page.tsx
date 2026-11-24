import { readForm, readGuestQuery } from "@makemyevent/core";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { asUser } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { masterKey } from "@/lib/pass-token";
import styles from "../event-shell.module.css";
import { choiceSplit } from "../choice-split";
import { glanceFor, registeredTotal } from "../glance-for";
import { loadManagedEvent } from "../load-event";
import { GlanceCard } from "../overview/glance";
import { columnsCookie, readColumns } from "./columns-cookie";
import { columnsOf, guestPage } from "./guests-data";
import { GuestsList } from "./guests-list";

export const metadata: Metadata = {
	title: "Guests",
	robots: { index: false, follow: false },
};

type Props = {
	params: Promise<{ event: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Guests: the Glance, invites and the blocklist, and everyone registered,
 * searchable and filterable, each opened in a panel to check them in.
 *
 * The list's search, filters and page are in the address, so a filtered
 * list reloads, and can be shared with the team, as it was.
 */
export default async function GuestsPage({ params, searchParams }: Props) {
	const [{ event: slug }, raw, store] = await Promise.all([
		params,
		searchParams,
		cookies(),
	]);
	const event = await loadManagedEvent(slug, "guests");
	const query = readGuestQuery(raw);

	const data = await asUser(event.viewerId, async (tx) => {
		const fields = await tx.formField.findMany({
			where: { eventId: event.id, archivedAt: null },
			orderBy: { position: "asc" },
			select: {
				id: true,
				kind: true,
				core: true,
				label: true,
				placeholder: true,
				help: true,
				required: true,
				settings: true,
				showIf: true,
			},
		});
		const page = await guestPage(tx, event.id, query, fields);
		// The cards' counts and the Glance's "last registered": each on an
		// index of its own.
		const [latest, invited, blocked, checkedIn] = await Promise.all([
			tx.registration.findFirst({
				where: { eventId: event.id, status: "confirmed" },
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				select: { createdAt: true },
			}),
			tx.registration.count({
				where: {
					eventId: event.id,
					source: "invite",
					status: { not: "cancelled" },
				},
			}),
			tx.blockedContact.count({ where: { eventId: event.id } }),
			tx.checkIn.count({ where: { eventId: event.id } }),
		]);
		// One ticket: the Summary splits by the form's choice question.
		const split =
			event.ticketTypes.length === 1
				? await choiceSplit(tx, event.id, registeredTotal(event))
				: null;
		return {
			fields,
			page,
			split,
			latest: latest?.createdAt ?? null,
			invited,
			blocked,
			checkedIn,
		};
	});

	const now = new Date();
	const glance = glanceFor(event, data.latest, now, data.split);
	const tones = Object.fromEntries(
		glance.types.map((type) => [type.id, type.tone]),
	);
	const canManage = event.role !== "volunteer";
	const columns = columnsOf(data.fields);
	const read = readForm(data.fields);
	const form = read.ok ? read.fields : [];

	return (
		<main>
			<h2 className={styles.srOnly}>Guests</h2>
			<GlanceCard
				glance={glance}
				timeZone={event.timeZone}
				limitHref={
					canManage
						? `/dashboard/${encodeURIComponent(event.slug)}/edit#capacity`
						: undefined
				}
				checkedIn={data.checkedIn}
			/>
			<GuestsList
				eventId={event.id}
				query={query}
				form={form}
				invited={data.invited}
				blocked={data.blocked}
				canManage={canManage}
				emailReady={emailConfigured() && masterKey() !== null}
				blocklistHref={`/dashboard/${encodeURIComponent(event.slug)}/guests/blocklist`}
				rows={data.page.rows}
				total={data.page.total}
				next={data.page.next}
				tickets={event.ticketTypes.map((type) => ({
					id: type.id,
					name: type.name,
					tone: tones[type.id] ?? "rest",
				}))}
				columns={columns}
				initialColumns={readColumns(
					store.get(columnsCookie(event.id))?.value,
					columns,
				)}
				timeZone={event.timeZone}
				now={now}
			/>
		</main>
	);
}
