"use server";

import {
	addMemberInput,
	type MemberRole,
	memberRoleInput,
	ROLE_LABELS,
	recordId,
} from "@makemyevent/core";
import { Prisma } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { emailConfigured, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { limited } from "@/lib/rate-limit";
import { actingUser, bringingPeopleIn } from "@/lib/require-user";
import type { CurrentUser } from "@/lib/supabase/identity";
import { displayNameOf } from "../../workspaces";
import {
	teamInviteHtml,
	teamInviteSubject,
	teamInviteText,
} from "./team-invite-email";

/**
 * The Team card's writes. Each runs as the person signed in, under row-level
 * security: only an event's owner and admins can change its team, and the
 * database refuses anyone else whatever this code is sent. The checks here
 * only turn those refusals, and bad input, into words.
 */

/**
 * What a form shows after a try; null before the first. `added` means it
 * worked, with something still to say (the email didn't go).
 */
export type TeamFormState = {
	field: "email" | "role" | null;
	message: string;
	added?: true;
} | null;

/** What a one-click change (role, remove) reports. */
export type TeamResult = { ok: true } | { ok: false; message: string };

const id = recordId;
const NOT_ALLOWED = "Only the owner and admins can change the team.";

function signedIn(slug: string) {
	return actingUser(`/dashboard/${encodeURIComponent(slug)}/overview`);
}

function refresh(slug: string) {
	revalidatePath(`/dashboard/${encodeURIComponent(slug)}/overview`);
}

function isRefused(error: unknown): boolean {
	// 42501: a row-level security policy said no.
	return (
		(error instanceof Prisma.PrismaClientKnownRequestError &&
			JSON.stringify(error.meta ?? {}).includes("42501")) ||
		(error instanceof Error && /row-level security|42501/.test(error.message))
	);
}

function issueField(
	issue: { path: readonly PropertyKey[] } | undefined,
): "email" | "role" | null {
	const key = issue?.path[0];
	return key === "email" || key === "role" ? key : null;
}

/** What each role is told it may do, in the invitation. */
const ROLE_HINTS: Record<MemberRole, string> = {
	admin: "As an admin you can run everything, the team included.",
	organizer: "As an organizer you can edit the event page, tickets and guests.",
	volunteer: "As a volunteer you can see the guest list and check guests in.",
};

/**
 * Add member: an invitation until they sign in with that email, and an email
 * telling them so. The row is the invitation; a failed email is said, and
 * the member stays added.
 */
export async function addMember(
	eventId: string,
	slug: string,
	_previous: TeamFormState,
	form: FormData,
): Promise<TeamFormState> {
	const user = await bringingPeopleIn(
		`/dashboard/${encodeURIComponent(slug)}/overview`,
	);
	if (!id.safeParse(eventId).success)
		return { field: null, message: "That event was not found." };

	const parsed = addMemberInput.safeParse({
		email: form.get("email"),
		role: form.get("role"),
	});
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return {
			field: issueField(issue),
			message: issue?.message ?? "Check the details.",
		};
	}
	const { email, role } = parsed.data;

	const slow = await limited("team.add", { user: user.id });
	if (slow) return { field: null, message: slow.message };

	let eventTitle: string;
	try {
		const outcome = await asUser(user, async (tx) => {
			const event = await tx.event.findUnique({
				where: { id: eventId },
				select: { title: true, host: { select: { email: true } } },
			});
			if (!event) return "missing" as const;
			if (event.host.email === email) return "owner" as const;
			await tx.eventMember.create({
				data: {
					eventId,
					email,
					// Their email until they join; then the name on their account.
					displayName: email.slice(0, 100),
					role,
					invitedById: user.id,
				},
				select: { id: true },
			});
			return { title: event.title };
		});
		if (outcome === "missing")
			return { field: null, message: "That event was not found." };
		if (outcome === "owner")
			return {
				field: "email",
				message: "That is the owner's email; they are on the team already.",
			};
		eventTitle = outcome.title;
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		)
			return {
				field: "email",
				message: "Someone with that email is on the team.",
			};
		if (isRefused(error)) return { field: null, message: NOT_ALLOWED };
		throw error;
	}

	refresh(slug);
	const unsent = await sendInvite(user, email, role, eventTitle, slug);
	return unsent
		? {
				field: null,
				added: true,
				message: `Added. They weren't emailed: ${unsent} Share the event's dashboard link with them yourself.`,
			}
		: null;
}

/** The invitation email; why it wasn't sent, or null once it was. */
async function sendInvite(
	user: CurrentUser,
	email: string,
	role: MemberRole,
	eventTitle: string,
	slug: string,
): Promise<string | null> {
	if (!emailConfigured()) return "email isn't set up on this site yet.";
	const slow = await limited("team.invite_email", { user: user.id, email });
	if (slow) return slow.message;
	const details = {
		inviterName: displayNameOf(user),
		eventTitle,
		roleLabel: ROLE_LABELS[role],
		roleHint: ROLE_HINTS[role],
		email,
		url: `${env.appUrl}/dashboard/${encodeURIComponent(slug)}/overview`,
	};
	const result = await sendEmail({
		to: email,
		subject: teamInviteSubject(details),
		html: teamInviteHtml(details),
		text: teamInviteText(details),
		// Added again later is a new invitation, so a new key each time.
		idempotencyKey: `team:${slug}:${email}:${Date.now()}`,
	});
	return result.ok ? null : `${result.message.replace(/\.$/, "")}.`;
}

const roleOnly = memberRoleInput;

/** The row's role menu: one change, saved at once. */
export async function setMemberRole(
	memberId: string,
	slug: string,
	role: string,
): Promise<TeamResult> {
	const user = await signedIn(slug);
	const parsedRole = roleOnly.safeParse(role);
	if (!id.safeParse(memberId).success || !parsedRole.success)
		return { ok: false, message: "That change could not be made." };

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };

	const { count } = await asUser(user, (tx) =>
		tx.eventMember.updateMany({
			where: { id: memberId },
			data: { role: parsedRole.data },
		}),
	);
	if (count === 0) return { ok: false, message: NOT_ALLOWED };

	refresh(slug);
	return { ok: true };
}

/** The bin: off the team, invitation or not. */
export async function removeMember(
	memberId: string,
	slug: string,
): Promise<TeamResult> {
	const user = await signedIn(slug);
	if (!id.safeParse(memberId).success)
		return { ok: false, message: "That member was not found." };

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, message: slow.message };

	const { count } = await asUser(user, (tx) =>
		tx.eventMember.deleteMany({ where: { id: memberId } }),
	);
	if (count === 0) return { ok: false, message: NOT_ALLOWED };

	refresh(slug);
	return { ok: true };
}
