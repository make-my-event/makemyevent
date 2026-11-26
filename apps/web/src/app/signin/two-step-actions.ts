"use server";

import { recordId } from "@makemyevent/core";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { qrSvg } from "@/lib/qr";
import { readRecoveryCode } from "@/lib/recovery-codes";
import { verifyHref } from "@/lib/require-user";
import { limited } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { removeAuthenticators } from "@/lib/supabase/admin";
import { type CurrentUser, getCurrentUser } from "@/lib/supabase/identity";
import { createClient } from "@/lib/supabase/server";
import { isFresh, readCode, verifiedTotp } from "@/lib/two-step";
import { sendTwoStepNotice } from "@/lib/two-step-email";
import {
	clearTries,
	countTry,
	record,
	replaceRecoveryCodes,
	spendRecoveryCode,
} from "@/lib/two-step-store";

/**
 * The second step of signing in. Every one of these runs on the server for
 * the session it arrives with, so the secret of a new authenticator and the
 * session that a right code earns never reach page scripts' hands, apart
 * from the secret being shown to the person it is for.
 *
 * Tries at a code are counted per person before each is made: five in
 * fifteen minutes, whichever screen they come from.
 */

export type SetupState =
	| { at: "start"; error?: string }
	| {
			at: "scan";
			factorId: string;
			/** An SVG, as a data address. */
			qr: string;
			secret: string;
			/** Opens an authenticator app on the phone this is read on. */
			uri: string;
			error?: string;
			/** Changes on each failed try, so the same message is heard again. */
			attempt?: number;
	  }
	| { at: "codes"; codes: string[] }
	| { at: "done"; note?: string };

export type CodeState = { error: string; attempt: number } | null;

const WRONG =
	"That code isn't right. Codes change every 30 seconds, so enter the newest one.";
const UNREACHABLE = "We couldn't check that just now. Try again in a moment.";

function waitText(seconds: number): string {
	const minutes = Math.ceil(seconds / 60);
	return `Too many tries. Wait ${minutes === 1 ? "a minute" : `${minutes} minutes`}, then try again.`;
}

function failure(error: {
	code?: string | undefined;
	status?: number | undefined;
}): string {
	if (error.code === "mfa_verification_failed") return WRONG;
	if (error.code === "mfa_challenge_expired") return WRONG;
	if (error.code === "over_request_rate_limit" || error.status === 429)
		return "Too many attempts. Wait a minute, then try again.";
	return UNREACHABLE;
}

function destination(form: FormData): string {
	const raw = form.get("next");
	return safeRedirectPath(typeof raw === "string" ? raw : null);
}

async function signedIn(next: string): Promise<CurrentUser> {
	const user = await getCurrentUser();
	if (!user) redirect(`/signin?${new URLSearchParams({ next })}`);
	return user;
}

/** The same person, as of the right code they have just given. */
function atAal2(user: CurrentUser): CurrentUser {
	return {
		...user,
		aal: "aal2",
		hasAuthenticator: true,
		codeGivenAt: new Date(),
	};
}

/** Changing an authenticator they have takes a code given just now. */
function needsFreshCode(user: CurrentUser): boolean {
	return user.hasAuthenticator && !isFresh(user, new Date());
}

/** Starts an authenticator: the QR code and key to put in the app. */
export async function startSetup(
	_previous: SetupState,
	form: FormData,
): Promise<SetupState> {
	const next = destination(form);
	const user = await signedIn(next);
	if (needsFreshCode(user)) redirect(`${verifyHref(next)}&again=1`);
	const slow = await limited("two_step.change", { user: user.id });
	if (slow) return { at: "start", error: slow.message };

	const supabase = await createClient();
	// One unfinished setup at a time: what an earlier visit left is dropped.
	for (const factor of user.factors ?? [])
		if (factor.status === "unverified")
			await supabase.auth.mfa.unenroll({ factorId: factor.id });

	const { data, error } = await supabase.auth.mfa.enroll({
		factorType: "totp",
		issuer: "makemyevent",
		// Supabase wants each of a person's names to differ.
		friendlyName: `Authenticator ${new Date().toISOString()}`,
	});
	if (error || !data)
		return {
			at: "start",
			error:
				error?.code === "over_request_rate_limit"
					? "Too many attempts. Wait a minute, then try again."
					: "We couldn't start that just now. Try again in a moment.",
		};

	const svg = await qrSvg(data.totp.uri);
	return {
		at: "scan",
		factorId: data.id,
		qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
		secret: data.totp.secret,
		uri: data.totp.uri,
	};
}

/** Finishes it with the app's first code, and gives out recovery codes. */
export async function finishSetup(
	previous: SetupState,
	form: FormData,
): Promise<SetupState> {
	const next = destination(form);
	const user = await signedIn(next);
	// The state came back from the browser: the id goes into a Supabase
	// address, so it must be an id and nothing else.
	if (previous.at !== "scan" || !recordId.safeParse(previous.factorId).success)
		return { at: "start" };
	const again = (error: string): SetupState => ({
		...previous,
		error,
		attempt: (previous.attempt ?? 0) + 1,
	});

	const moving = user.hasAuthenticator;
	if (needsFreshCode(user)) redirect(`${verifyHref(next)}&again=1`);

	const code = readCode(form.get("code"));
	if (!code) return again("Enter the 6 digits your app shows.");
	const slow = await limited("two_step.code", { user: user.id });
	if (slow) return again(slow.message);
	const wait = await countTry(user);
	if (wait > 0) return again(waitText(wait));

	const supabase = await createClient();
	// Supabase takes only an authenticator of this person's own.
	const { error } = await supabase.auth.mfa.challengeAndVerify({
		factorId: previous.factorId,
		code,
	});
	if (error) {
		// Left too long, or started again in another tab.
		if (error.code === "mfa_factor_not_found")
			return {
				at: "start",
				error: "That setup timed out. Start again to get a new QR code.",
			};
		return again(failure(error));
	}

	const now = atAal2(user);
	if (moving) {
		for (const old of verifiedTotp(user.factors))
			if (old.id !== previous.factorId)
				await supabase.auth.mfa.unenroll({ factorId: old.id });
	}
	after(() => sendTwoStepNotice(user.email, moving ? "moved" : "turned_on"));

	// It is on from here. What follows must not report otherwise.
	try {
		await clearTries(now);
		await record(now, moving ? "moved" : "turned_on");
		if (moving) return { at: "done" };
		return { at: "codes", codes: await replaceRecoveryCodes(now) };
	} catch (cause) {
		console.error("two-step setup: saving after verification failed", cause);
		return {
			at: "done",
			...(moving
				? {}
				: {
						note: "We couldn't make your recovery codes just now. Make them under Account security.",
					}),
		};
	}
}

/** A code from the authenticator, at sign-in or before a change. */
export async function enterCode(
	previous: CodeState,
	form: FormData,
): Promise<CodeState> {
	const next = destination(form);
	const user = await signedIn(next);
	const again = (error: string): CodeState => ({
		error,
		attempt: (previous?.attempt ?? 0) + 1,
	});

	const factors = verifiedTotp(user.factors);
	// Removed meanwhile: nothing to ask for here, and the page decides anew.
	if (factors.length === 0) redirect(next);

	const code = readCode(form.get("code"));
	if (!code) return again("Enter the 6 digits your app shows.");
	const slow = await limited("two_step.code", { user: user.id });
	if (slow) return again(slow.message);
	const wait = await countTry(user);
	if (wait > 0) return again(waitText(wait));

	const supabase = await createClient();
	let problem = WRONG;
	let right = false;
	// One, but for the moment between adding a new phone and dropping the old.
	for (const factor of factors) {
		const { error } = await supabase.auth.mfa.challengeAndVerify({
			factorId: factor.id,
			code,
		});
		if (!error) {
			right = true;
			break;
		}
		problem = failure(error);
	}
	if (!right) return again(problem);

	await clearTries(atAal2(user));
	redirect(next);
}

/**
 * A recovery code in place of the authenticator: the lost one comes off the
 * account, other devices are signed out, and a new one is set up next.
 */
export async function enterRecoveryCode(
	previous: CodeState,
	form: FormData,
): Promise<CodeState> {
	const next = destination(form);
	const user = await signedIn(next);
	const again = (error: string): CodeState => ({
		error,
		attempt: (previous?.attempt ?? 0) + 1,
	});
	if (!user.hasAuthenticator) redirect(next);

	const code = readRecoveryCode(form.get("code"));
	const slow = await limited("two_step.code", { user: user.id });
	if (slow) return again(slow.message);
	const wait = await countTry(user);
	if (wait > 0) return again(waitText(wait));
	if (!code)
		return again("A recovery code has 16 letters and numbers. Check it.");

	let used: boolean;
	try {
		used = await spendRecoveryCode(user, code, () =>
			removeAuthenticators(user.id),
		);
	} catch (cause) {
		console.error("two-step recovery failed", cause);
		return again(
			"We couldn't do that just now. Your code is still good. Try again in a moment.",
		);
	}
	if (!used)
		return again("That code isn't right, or it has been used already.");

	const supabase = await createClient();
	await supabase.auth.signOut({ scope: "others" });
	after(() => sendTwoStepNotice(user.email, "recovered"));
	redirect(`/signin/setup?${new URLSearchParams({ next, recovered: "1" })}`);
}
