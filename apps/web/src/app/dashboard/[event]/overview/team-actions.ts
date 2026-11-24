"use server";

import {
	addMemberInput,
	editMemberInput,
	memberRoleInput,
	recordId,
} from "@makemyevent/core";
import { Prisma } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/identity";

/**
 * The Team card's writes. Each runs as the person signed in, under row-level
 * security: only an event's owner and admins can change its team, and the
 * database refuses anyone else whatever this code is sent. The checks here
 * only turn those refusals, and bad input, into words.
 */

/** What a form shows after a try; null before the first. */
export type TeamFormState = {
	field: "name" | "email" | "role" | null;
	message: string;
} | null;

/** What a one-click change (role, remove) reports. */
export type TeamResult = { ok: true } | { ok: false; message: string };

const id = recordId;
const NOT_ALLOWED = "Only the owner and admins can change the team.";

async function signedIn(slug: string) {
	const user = await getCurrentUser();
	if (!user)
		redirect(
			`/signin?next=${encodeURIComponent(`/dashboard/${encodeURIComponent(slug)}/overview`)}`,
		);
	return user;
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
): "name" | "email" | "role" | null {
	const key = issue?.path[0];
	return key === "name" || key === "email" || key === "role" ? key : null;
}

/** Add member: an invitation until they sign in with that email. */
export async function addMember(
	eventId: string,
	slug: string,
	_previous: TeamFormState,
	form: FormData,
): Promise<TeamFormState> {
	const user = await signedIn(slug);
	if (!id.safeParse(eventId).success)
		return { field: null, message: "That event was not found." };

	const parsed = addMemberInput.safeParse({
		name: form.get("name"),
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
	const { name, email, role } = parsed.data;

	try {
		const outcome = await asUser(user.id, async (tx) => {
			const event = await tx.event.findUnique({
				where: { id: eventId },
				select: { host: { select: { email: true } } },
			});
			if (!event) return "missing" as const;
			if (event.host.email === email) return "owner" as const;
			await tx.eventMember.create({
				data: {
					eventId,
					email,
					displayName: name,
					role,
					invitedById: user.id,
				},
				select: { id: true },
			});
			return "added" as const;
		});
		if (outcome === "missing")
			return { field: null, message: "That event was not found." };
		if (outcome === "owner")
			return {
				field: "email",
				message: "That is the owner's email; they are on the team already.",
			};
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
	return null;
}

/** The pencil: a member's name and role. */
export async function editMember(
	memberId: string,
	slug: string,
	_previous: TeamFormState,
	form: FormData,
): Promise<TeamFormState> {
	const user = await signedIn(slug);
	if (!id.safeParse(memberId).success)
		return { field: null, message: "That member was not found." };

	const parsed = editMemberInput.safeParse({
		name: form.get("name"),
		role: form.get("role"),
	});
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return {
			field: issueField(issue),
			message: issue?.message ?? "Check the details.",
		};
	}

	// A row the policies hide or refuse is simply not updated.
	const { count } = await asUser(user.id, (tx) =>
		tx.eventMember.updateMany({
			where: { id: memberId },
			data: { displayName: parsed.data.name, role: parsed.data.role },
		}),
	);
	if (count === 0) return { field: null, message: NOT_ALLOWED };

	refresh(slug);
	return null;
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

	const { count } = await asUser(user.id, (tx) =>
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

	const { count } = await asUser(user.id, (tx) =>
		tx.eventMember.deleteMany({ where: { id: memberId } }),
	);
	if (count === 0) return { ok: false, message: NOT_ALLOWED };

	refresh(slug);
	return { ok: true };
}
