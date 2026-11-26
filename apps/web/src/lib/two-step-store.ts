import "server-only";
import { claimInvites } from "@/app/dashboard/claim-invites";
import { asUser } from "./db";
import { newRecoveryCodes, recoveryDigest } from "./recovery-codes";
import type { CurrentUser } from "./supabase/identity";

/**
 * What the database keeps for two-step sign-in, through the functions that
 * are the only way to it (see the two_step_sign_in migration).
 */

/** Counts a try at a code. 0 to go ahead, or the seconds to wait first. */
export function countTry(user: CurrentUser): Promise<number> {
	return asUser(user, async (tx) => {
		// Their row, which the count hangs from, if this is their first visit.
		await claimInvites(tx, user);
		const [row] = await tx.$queryRaw<{ wait: number }[]>`
			SELECT app.count_two_step_try() AS wait
		`;
		return row?.wait ?? 60;
	});
}

export async function clearTries(user: CurrentUser): Promise<void> {
	await asUser(
		user,
		(tx) => tx.$queryRaw`SELECT app.clear_two_step_tries()::text`,
	);
}

/** Puts it in the append-only audit log. */
export async function record(
	user: CurrentUser,
	what: "turned_on" | "moved" | "turned_off",
): Promise<void> {
	await asUser(
		user,
		(tx) => tx.$queryRaw`SELECT app.record_two_step(${what})::text`,
	);
}

/** Ten new codes in place of any before; shown once, kept only hashed. */
export async function replaceRecoveryCodes(
	user: CurrentUser,
): Promise<string[]> {
	const codes = newRecoveryCodes();
	const digests = codes.map(recoveryDigest);
	await asUser(
		user,
		(tx) =>
			tx.$queryRaw`SELECT app.save_recovery_codes(${digests}::text[])::text`,
	);
	return codes;
}

export function recoveryCodesLeft(user: CurrentUser): Promise<number> {
	return asUser(user, async (tx) => {
		const [row] = await tx.$queryRaw<{ left: number }[]>`
			SELECT app.recovery_codes_left() AS left
		`;
		return row?.left ?? 0;
	});
}

/**
 * Uses a recovery code up and runs `then` before that is final: if `then`
 * fails, the code is still good.
 */
export function spendRecoveryCode(
	user: CurrentUser,
	code: string,
	then: () => Promise<void>,
): Promise<boolean> {
	return asUser(
		user,
		async (tx) => {
			const [row] = await tx.$queryRaw<{ used: boolean }[]>`
				SELECT app.use_recovery_code(${recoveryDigest(code)}) AS used
			`;
			if (!row?.used) return false;
			await then();
			return true;
		},
		{ maxWait: 10_000, timeout: 20_000 },
	);
}
