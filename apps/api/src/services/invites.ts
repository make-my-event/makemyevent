import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "db";

/**
 * Team invitations (organizer members, sub-community members, event
 * volunteers).
 *
 * - An invitation is stored against an email only. Creating one never looks up
 *   or links an account, so inviting an address reveals nothing about whether
 *   it has an account.
 * - The invitee receives a single-use link containing a random 256-bit token.
 *   Only its SHA-256 hash is stored. Opening the link and accepting it proves
 *   control of that inbox, so any account can accept it.
 * - A signed-in user whose verified email matches a pending invitation also
 *   sees it in the app and can accept or decline it there.
 * - Nothing joins automatically: every invitation needs an explicit Accept.
 * - Invitations expire after INVITE_TTL_MS. Re-inviting the same email issues
 *   a new token and expiry (the old link stops working). Removing the member
 *   revokes the invitation.
 */

export const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * OAuth providers whose sign-in proves ownership of the account email (see the
 * allowDangerousEmailAccountLinking notes in apps/web/src/lib/auth.ts and
 * docs/security.md). Keep in sync with the providers configured there.
 */
const EMAIL_VERIFYING_PROVIDERS = ["google", "github"] as const;

export type InviteKind = "organization" | "community" | "event";

export interface IssuedInviteToken {
	/** Raw token: goes in the emailed link only. Never stored or logged. */
	token: string;
	tokenHash: string;
	expiresAt: Date;
}

export function hashInviteToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function issueInviteToken(now: Date = new Date()): IssuedInviteToken {
	const token = randomBytes(32).toString("base64url");
	return {
		token,
		tokenHash: hashInviteToken(token),
		expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
	};
}

export interface InviteDetails {
	kind: InviteKind;
	id: string;
	email: string;
	role: string;
	targetName: string;
	/** Where the invitee lands after accepting. */
	targetPath: string;
	expiresAt: Date | null;
}

type Where = { id: string } | { inviteTokenHash: string };

/** Pending (not yet accepted) invitation of each kind matching `where`. */
async function findPending(
	client: PrismaClient,
	where: Where,
): Promise<InviteDetails | null> {
	const pending = { ...where, userId: null };

	const org = await client.organizerMember.findFirst({
		where: pending,
		select: {
			id: true,
			email: true,
			role: true,
			inviteExpiresAt: true,
			organizer: { select: { name: true, slug: true } },
		},
	});
	if (org) {
		return {
			kind: "organization",
			id: org.id,
			email: org.email,
			role: org.role,
			targetName: org.organizer.name,
			targetPath: `/organization/${org.organizer.slug}`,
			expiresAt: org.inviteExpiresAt,
		};
	}

	const community = await client.communityMember.findFirst({
		where: pending,
		select: {
			id: true,
			email: true,
			role: true,
			inviteExpiresAt: true,
			community: {
				select: {
					name: true,
					slug: true,
					organizer: { select: { slug: true } },
				},
			},
		},
	});
	if (community) {
		return {
			kind: "community",
			id: community.id,
			email: community.email,
			role: community.role,
			targetName: community.community.name,
			targetPath: `/organization/${community.community.organizer.slug}/community/${community.community.slug}`,
			expiresAt: community.inviteExpiresAt,
		};
	}

	const volunteer = await client.eventVolunteer.findFirst({
		where: pending,
		select: {
			id: true,
			email: true,
			role: true,
			customRole: true,
			inviteExpiresAt: true,
			event: { select: { title: true, slug: true } },
		},
	});
	if (volunteer) {
		return {
			kind: "event",
			id: volunteer.id,
			email: volunteer.email,
			role: volunteer.customRole || volunteer.role,
			targetName: volunteer.event.title,
			targetPath: `/events/${volunteer.event.slug}`,
			expiresAt: volunteer.inviteExpiresAt,
		};
	}

	return null;
}

const isExpired = (invite: InviteDetails, now = new Date()) =>
	invite.expiresAt !== null && invite.expiresAt <= now;

/**
 * Atomically attaches a pending invitation to `userId` and invalidates its
 * token. The `userId: null` condition makes acceptance single-use even under
 * concurrent requests.
 */
async function attach(
	client: PrismaClient,
	invite: InviteDetails,
	userId: string,
): Promise<boolean> {
	const where = { id: invite.id, userId: null };
	const data = { userId, inviteTokenHash: null, inviteExpiresAt: null };
	const result =
		invite.kind === "organization"
			? await client.organizerMember.updateMany({ where, data })
			: invite.kind === "community"
				? await client.communityMember.updateMany({ where, data })
				: await client.eventVolunteer.updateMany({ where, data });
	return result.count === 1;
}

/** Deletes a still-pending invitation (decline). */
async function discard(
	client: PrismaClient,
	invite: InviteDetails,
): Promise<void> {
	const where = { id: invite.id, userId: null };
	if (invite.kind === "organization") {
		await client.organizerMember.deleteMany({ where });
	} else if (invite.kind === "community") {
		await client.communityMember.deleteMany({ where });
	} else {
		await client.eventVolunteer.deleteMany({ where });
	}
}

const notFound = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message:
			"This invitation link is not valid. It may have been used already or replaced by a newer invitation.",
	});

const expired = () =>
	new TRPCError({
		code: "BAD_REQUEST",
		message:
			"This invitation has expired. Ask the organizer to send you a new one.",
	});

/** "j***@example.com": lets the invitee recognise the address on the invite page. */
function maskEmail(email: string): string {
	const [local, domain] = email.split("@");
	if (!domain) return "***";
	return `${local.slice(0, 1)}***@${domain}`;
}

export interface InvitePreview {
	kind: InviteKind;
	role: string;
	targetName: string;
	emailHint: string;
	expiresAt: Date | null;
	expired: boolean;
}

export async function previewInviteByToken(
	client: PrismaClient,
	token: string,
): Promise<InvitePreview> {
	const invite = await findPending(client, {
		inviteTokenHash: hashInviteToken(token),
	});
	if (!invite) throw notFound();
	return {
		kind: invite.kind,
		role: invite.role,
		targetName: invite.targetName,
		emailHint: maskEmail(invite.email),
		expiresAt: invite.expiresAt,
		expired: isExpired(invite),
	};
}

export async function acceptInviteByToken(
	client: PrismaClient,
	token: string,
	userId: string,
): Promise<{ targetPath: string }> {
	const invite = await findPending(client, {
		inviteTokenHash: hashInviteToken(token),
	});
	if (!invite) throw notFound();
	if (isExpired(invite)) throw expired();
	if (!(await attach(client, invite, userId))) throw notFound();
	return { targetPath: invite.targetPath };
}

export async function declineInviteByToken(
	client: PrismaClient,
	token: string,
): Promise<void> {
	const invite = await findPending(client, {
		inviteTokenHash: hashInviteToken(token),
	});
	if (!invite) throw notFound();
	await discard(client, invite);
}

/**
 * The signed-in user's verified email, or null when it is not verified
 * (emailVerified set, or a sign-in through an email-verifying OAuth provider).
 * In-app invitations are matched by email, so an unverified address must never
 * match: anyone could register an account with someone else's email.
 */
export async function verifiedEmail(
	client: PrismaClient,
	userId: string,
): Promise<string | null> {
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
	if (!user?.email) return null;
	const verified = user.emailVerified !== null || user.accounts.length > 0;
	return verified ? user.email.trim().toLowerCase() : null;
}

export interface MyPendingInvite {
	kind: InviteKind;
	id: string;
	role: string;
	targetName: string;
	expiresAt: Date | null;
}

/** Pending, unexpired invitations sent to the user's verified email. */
export async function listMyPendingInvites(
	client: PrismaClient,
	userId: string,
): Promise<MyPendingInvite[]> {
	const email = await verifiedEmail(client, userId);
	if (!email) return [];

	const now = new Date();
	// Invite emails are always stored lowercased (see the add-member procedures).
	const where = {
		email,
		userId: null,
		OR: [{ inviteExpiresAt: null }, { inviteExpiresAt: { gt: now } }],
	};

	const [orgs, communities, volunteers] = await Promise.all([
		client.organizerMember.findMany({
			where,
			select: {
				id: true,
				role: true,
				inviteExpiresAt: true,
				organizer: { select: { name: true } },
			},
		}),
		client.communityMember.findMany({
			where,
			select: {
				id: true,
				role: true,
				inviteExpiresAt: true,
				community: { select: { name: true } },
			},
		}),
		client.eventVolunteer.findMany({
			where,
			select: {
				id: true,
				role: true,
				customRole: true,
				inviteExpiresAt: true,
				event: { select: { title: true } },
			},
		}),
	]);

	return [
		...orgs.map((o) => ({
			kind: "organization" as const,
			id: o.id,
			role: o.role,
			targetName: o.organizer.name,
			expiresAt: o.inviteExpiresAt,
		})),
		...communities.map((c) => ({
			kind: "community" as const,
			id: c.id,
			role: c.role,
			targetName: c.community.name,
			expiresAt: c.inviteExpiresAt,
		})),
		...volunteers.map((v) => ({
			kind: "event" as const,
			id: v.id,
			role: v.customRole || v.role,
			targetName: v.event.title,
			expiresAt: v.inviteExpiresAt,
		})),
	];
}

/**
 * Accept or decline an in-app invitation. The invitation must still be pending,
 * unexpired, and addressed to the caller's verified email.
 */
export async function respondToMyInvite(
	client: PrismaClient,
	userId: string,
	input: { kind: InviteKind; id: string; accept: boolean },
): Promise<{ targetPath: string | null }> {
	const email = await verifiedEmail(client, userId);
	const invite = await findPending(client, { id: input.id });
	if (
		!email ||
		!invite ||
		invite.kind !== input.kind ||
		invite.email !== email
	) {
		throw notFound();
	}
	if (!input.accept) {
		await discard(client, invite);
		return { targetPath: null };
	}
	if (isExpired(invite)) throw expired();
	if (!(await attach(client, invite, userId))) throw notFound();
	return { targetPath: invite.targetPath };
}
