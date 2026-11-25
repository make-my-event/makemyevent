import "server-only";
import type { Tx } from "@makemyevent/db";
import type { getCurrentUser } from "@/lib/supabase/identity";
import { displayNameOf } from "./workspaces";

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Turns this person's team invitations into memberships, inside the caller's
 * transaction (which already runs as them).
 *
 * Invitations are matched by the email on their own users row, so the row
 * is written first if this is their first visit: from the session the server
 * has verified, never from anything the browser sent. app.claim_invites()
 * does the rest; it is the only way a membership gets a user.
 */
export async function claimInvites(
	tx: Tx,
	user: SignedInUser,
): Promise<number> {
	if (!(await ensureUser(tx, user))) return 0;
	const [row] = await tx.$queryRaw<{ claimed: number }[]>`
		SELECT app.claim_invites() AS claimed
	`;
	return row?.claimed ?? 0;
}

/**
 * Turns every ticket held in this person's email into theirs, the same way:
 * app.claim_tickets() is the only way a ticket gets a user. Asked each time
 * they open their tickets, so one sent to them since is there too.
 */
export async function claimTickets(tx: Tx, user: SignedInUser): Promise<void> {
	if (await ensureUser(tx, user))
		await tx.$queryRaw`SELECT app.claim_tickets()`;
}

/** Their own row, written on their first visit; false without an email. */
async function ensureUser(tx: Tx, user: SignedInUser): Promise<boolean> {
	const email = (user.email ?? "").toLowerCase();
	if (!email) return false;
	await tx.user.createMany({
		data: [{ id: user.id, email, displayName: displayNameOf(user) }],
		skipDuplicates: true,
	});
	return true;
}
