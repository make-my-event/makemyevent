import type { PrismaClient } from "db";

/**
 * OAuth providers whose sign-in proves ownership of the account email (see the
 * allowDangerousEmailAccountLinking notes in apps/web/src/lib/auth.ts and
 * docs/security.md). Keep in sync with the providers configured there.
 */
const EMAIL_VERIFYING_PROVIDERS = ["google", "github"] as const;

export interface LinkPendingInvitesResult {
	/** Invites newly attached to this account. */
	linked: number;
	/** True when invites were not linked because the email is unverified. */
	requiresVerification: boolean;
}

/**
 * Attaches pending invitations (organizer team, sub-community team, event
 * volunteer) that were sent to this user's email address.
 *
 * Invitations are stored against an email only; they are never linked to an
 * account when the organizer creates them, so inviting an address reveals
 * nothing about whether it has an account. This runs on the invitee's own
 * requests (sign-in and page load), which is the only way an invite becomes
 * access.
 *
 * Security:
 * - The email is read from the user's database record, never from the client.
 * - Invites are linked only when that email is verified (emailVerified set, or
 *   a sign-in through an email-verifying OAuth provider is attached). Otherwise
 *   someone could register an unverified account with another person's address
 *   and inherit their invitations.
 * - Only invites with no linked account are touched.
 */
export async function linkPendingInvites(
	client: PrismaClient,
	userId: string,
): Promise<LinkPendingInvitesResult> {
	const user = await client.user.findUnique({
		where: { id: userId },
		select: {
			email: true,
			emailVerified: true,
			accounts: {
				where: { provider: { in: [...EMAIL_VERIFYING_PROVIDERS] } },
				select: { id: true },
				take: 1,
			},
		},
	});
	if (!user?.email) return { linked: 0, requiresVerification: false };

	const verified = user.emailVerified !== null || user.accounts.length > 0;
	if (!verified) return { linked: 0, requiresVerification: true };

	// Invite emails are always stored lowercased (see the add-member procedures).
	const email = user.email.trim().toLowerCase();
	const where = { email, userId: null };
	const [organizer, community, volunteer] = await Promise.all([
		client.organizerMember.updateMany({ where, data: { userId } }),
		client.communityMember.updateMany({ where, data: { userId } }),
		client.eventVolunteer.updateMany({ where, data: { userId } }),
	]);

	return {
		linked: organizer.count + community.count + volunteer.count,
		requiresVerification: false,
	};
}
