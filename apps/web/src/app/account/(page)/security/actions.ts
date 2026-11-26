"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { actingUser, mustKeepTwoStep, verifyHref } from "@/lib/require-user";
import type { CurrentUser } from "@/lib/supabase/identity";
import { createClient } from "@/lib/supabase/server";
import { limited } from "@/lib/rate-limit";
import { isFresh, verifiedTotp } from "@/lib/two-step";
import { sendTwoStepNotice } from "@/lib/two-step-email";
import { record, replaceRecoveryCodes } from "@/lib/two-step-store";

const HERE = "/account/security";

export type SecurityState =
	| { codes: string[] }
	| { message: string }
	| { error: string; attempt: number }
	| null;

/** Their session, with a code given in the last ten minutes. */
async function freshly(): Promise<CurrentUser> {
	const user = await actingUser(HERE);
	if (!user.hasAuthenticator) redirect(HERE);
	if (!isFresh(user, new Date())) redirect(`${verifyHref(HERE)}&again=1`);
	return user;
}

/** Too many changes, said as a state; null to go ahead. */
async function tooMany(user: CurrentUser): Promise<SecurityState> {
	const slow = await limited("two_step.change", { user: user.id });
	return slow ? { error: slow.message, attempt: Date.now() } : null;
}

function failed(previous: SecurityState): SecurityState {
	return {
		error: "We couldn't do that just now. Try again in a moment.",
		attempt: (previous && "attempt" in previous ? previous.attempt : 0) + 1,
	};
}

/** Ten new recovery codes; the ones before stop working. */
export async function makeNewCodes(
	previous: SecurityState,
): Promise<SecurityState> {
	const user = await freshly();
	const slow = await tooMany(user);
	if (slow) return slow;
	let codes: string[];
	try {
		codes = await replaceRecoveryCodes(user);
	} catch (cause) {
		console.error("new recovery codes failed", cause);
		return failed(previous);
	}
	after(() => sendTwoStepNotice(user.email, "new_codes"));
	revalidatePath(HERE);
	return { codes };
}

/** Off, for someone who does not run events. */
export async function turnOff(previous: SecurityState): Promise<SecurityState> {
	const user = await freshly();
	const slow = await tooMany(user);
	if (slow) return slow;
	if (await mustKeepTwoStep(user))
		return {
			error:
				"You run an event, so two-step sign-in stays on. You can move it to another phone.",
			attempt: 1,
		};
	const supabase = await createClient();
	for (const factor of verifiedTotp(user.factors)) {
		const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
		if (error) return failed(previous);
	}
	await record(user, "turned_off").catch((cause) =>
		console.error("two-step: turning off was not recorded", cause),
	);
	after(() => sendTwoStepNotice(user.email, "turned_off"));
	revalidatePath(HERE);
	return { message: "Two-step sign-in is off." };
}

/** Every session but this one ends now, not when its token expires. */
export async function signOutOthers(
	previous: SecurityState,
): Promise<SecurityState> {
	const user = await actingUser(HERE);
	const slow = await tooMany(user);
	if (slow) return slow;
	const supabase = await createClient();
	const { error } = await supabase.auth.signOut({ scope: "others" });
	if (error) return failed(previous);
	return { message: "Your other devices are signed out." };
}
