import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * Takes every authenticator off an account, for someone who has just used a
 * recovery code. Needs the secret key because Supabase rightly lets no one
 * do this from a session that has not passed its second step.
 *
 * Called from one place (the recovery action), only after the database has
 * used the code up, and only for the id of the session it came from.
 */
export async function removeAuthenticators(userId: string): Promise<void> {
	const key = process.env.SUPABASE_SECRET_KEY;
	if (!key) throw new Error("SUPABASE_SECRET_KEY is not set.");
	const { mfa } = createClient(env.supabaseUrl, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	}).auth.admin;

	const { data, error } = await mfa.listFactors({ userId });
	if (error) throw new Error(`Listing authenticators failed: ${error.message}`);
	for (const factor of data.factors) {
		const { error: failed } = await mfa.deleteFactor({ id: factor.id, userId });
		if (failed)
			throw new Error(`Removing an authenticator failed: ${failed.message}`);
	}
}
