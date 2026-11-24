"use server";

import {
	createEventInput,
	numberedSlug,
	slugFromTitle,
} from "@makemyevent/core";
import { Prisma } from "@makemyevent/db";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/identity";
import { displayNameOf } from "./workspaces";

/** What the popup shows when creating fails; null before the first try. */
export type CreateEventState = {
	field: "title" | "host" | null;
	message: string;
} | null;

/** Numbered addresses tried before falling back to a random ending. */
const NUMBERED_ATTEMPTS = 20;

/**
 * Creates a draft event from the Create Event popup and opens its Event Page
 * section, where the rest is filled in.
 *
 * The draft starts with the name, its address and a General Pass ticket, so
 * every event has at least one ticket from the first moment. Nothing about
 * it is public until it is published.
 *
 * The address comes from the name. Drafts of other hosts are invisible here,
 * so a taken address is found by the database refusing it, and the next
 * number is tried: carnival, carnival-2, carnival-3…
 */
export async function createEvent(
	_previous: CreateEventState,
	form: FormData,
): Promise<CreateEventState> {
	const user = await getCurrentUser();
	if (!user) redirect("/signin?next=%2Fdashboard");

	const parsed = createEventInput.safeParse({
		title: form.get("title"),
		host: form.get("host"),
	});
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const field = issue?.path[0] === "host" ? "host" : "title";
		return { field, message: issue?.message ?? "Check the event name." };
	}
	const { title } = parsed.data;

	const base = slugFromTitle(title);
	let slug: string | null = null;
	for (let attempt = 1; attempt <= NUMBERED_ATTEMPTS + 1 && !slug; attempt++) {
		const candidate =
			attempt <= NUMBERED_ATTEMPTS
				? numberedSlug(base, attempt)
				: numberedSlug(base, 1000 + Math.floor(Math.random() * 9000));
		slug = await insertDraft(user, title, candidate);
	}
	if (!slug)
		return {
			field: null,
			message:
				"That name is very popular. Try adding a word, like the city or year.",
		};

	// ?created asks, once, who should find it (see VisibilityDialog).
	redirect(`/dashboard/${encodeURIComponent(slug)}/edit?created=1`);
}

/**
 * One try at an address. Returns it once the draft exists, or null when the
 * address is taken.
 */
async function insertDraft(
	user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
	title: string,
	slug: string,
): Promise<string | null> {
	try {
		await asUser(user.id, async (tx) => {
			// Their own row, on the first thing they create. Written from the
			// verified session; an existing row is left as it is.
			await tx.user.createMany({
				data: [
					{
						id: user.id,
						email: (user.email ?? "").toLowerCase(),
						displayName: displayNameOf(user),
					},
				],
				skipDuplicates: true,
			});
			await tx.event.create({
				data: {
					hostUserId: user.id,
					slug,
					title,
					ticketTypes: { create: { name: "General Pass" } },
				},
				select: { id: true },
			});
		});
		return slug;
	} catch (error) {
		if (isSlugTaken(error)) return null;
		throw error;
	}
}

function isSlugTaken(error: unknown): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
	if (error.code !== "P2002") return false;
	return JSON.stringify(error.meta ?? {}).includes("slug");
}
