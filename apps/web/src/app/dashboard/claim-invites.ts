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
	const email = (user.email ?? "").toLowerCase();
	if (!email) return 0;
	await tx.user.createMany({
		data: [{ id: user.id, email, displayName: displayNameOf(user) }],
		skipDuplicates: true,
	});
	const [row] = await tx.$queryRaw<{ claimed: number }[]>`
		SELECT app.claim_invites() AS claimed
	`;
	return row?.claimed ?? 0;
}
