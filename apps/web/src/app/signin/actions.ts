"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { NEXT_COOKIE, safeRedirectPath } from "@/lib/safe-redirect";
import { hardenCookie } from "@/lib/supabase/cookies";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
	/** idle: show the form. sent: show "check your email". */
	status: "idle" | "sent";
	/** Shown to the person. Says what happened and what to do about it. */
	error?: string;
	/** Kept so the field is not cleared after a failed attempt. */
	email?: string;
	/** Changes on every successful send, which restarts the resend countdown. */
	sentAt?: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** RFC 5321 limit. Anything longer is not an address. */
const EMAIL_MAX = 254;

/**
 * Turns a failure into words that say what happened and how to fix it.
 * Never leaks whether an account exists.
 */
function describe(error: unknown): string {
	const e = (error ?? {}) as {
		code?: string;
		status?: number;
		name?: string;
		message?: string;
	};
	if (e.code === "over_email_send_rate_limit") {
		return "We just sent a link to this address. Wait a minute, then try again.";
	}
	if (e.code === "over_request_rate_limit" || e.status === 429) {
		return "Too many attempts. Wait a few minutes, then try again.";
	}
	if (e.code === "email_address_invalid" || e.code === "validation_failed") {
		return "That doesn't look like an email address. Check it and try again.";
	}
	if (e.name === "AuthRetryableFetchError" || e.status === 0) {
		return "We can't reach the server. Check your connection and try again.";
	}
	return "We couldn't do that just now. Try again in a moment.";
}

/** Remembers where to go after signing in. Script-proof, and expires in 15 minutes. */
async function rememberDestination(raw: FormDataEntryValue | null) {
	const next = safeRedirectPath(typeof raw === "string" ? raw : null);
	const store = await cookies();
	store.set(NEXT_COOKIE, next, hardenCookie({ maxAge: 900 }));
	return next;
}

/**
 * Sends a one-time sign-in link.
 *
 * This runs on the server, so the one-time secret that completes the sign-in is
 * written as an httpOnly cookie that page scripts cannot read.
 *
 * Reachable by anyone, like any public endpoint: Next verifies the request
 * origin, the input is validated here, and Supabase rate-limits per address and
 * per IP. It deliberately grants no access on its own — success only means an
 * email was sent.
 */
export async function requestMagicLink(
	_previous: SignInState,
	formData: FormData,
): Promise<SignInState> {
	const raw = formData.get("email");
	const email = typeof raw === "string" ? raw.trim() : "";

	if (!email) {
		return { status: "idle", error: "Enter your email address." };
	}
	if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
		return {
			status: "idle",
			email,
			error: "That doesn't look like an email address. Check it and try again.",
		};
	}

	await rememberDestination(formData.get("next"));

	const supabase = await createClient();
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: {
			emailRedirectTo: `${env.appUrl}/auth/callback`,
			shouldCreateUser: true,
		},
	});

	if (error) {
		return { status: "idle", email, error: describe(error) };
	}

	return { status: "sent", email, sentAt: Date.now() };
}

/**
 * Starts Google sign-in and hands the browser to Google.
 *
 * Also server-side, so Google's one-time secret never exists in a cookie that
 * scripts can read. Returns a state only when something failed; otherwise it
 * redirects and never returns.
 */
export async function startGoogleSignIn(
	_previous: SignInState,
	formData: FormData,
): Promise<SignInState> {
	await rememberDestination(formData.get("next"));

	const supabase = await createClient();
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: "google",
		options: { redirectTo: `${env.appUrl}/auth/callback` },
	});

	if (error || !data?.url) {
		return { status: "idle", error: describe(error) };
	}

	redirect(data.url);
}
