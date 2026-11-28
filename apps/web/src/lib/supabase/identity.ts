import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { type Assurance, assuranceOf } from "../two-step";
import { createClient } from "./server";

/**
 * Header the middleware uses to hand the signed-in person's display name to
 * the render. The middleware has already verified the session token
 * (signature and expiry), so the page chrome does not have to ask again.
 *
 * The middleware sets this on every request it handles, and deletes it when
 * nobody is signed in, so a value sent by a browser never reaches a page.
 */
export const DISPLAY_NAME_HEADER = "x-mme-display-name";

/** Percent-encoded: a header may only carry Latin-1, a name may not. */
export function encodeDisplayName(name: string): string {
	return encodeURIComponent(name);
}

/**
 * The signed-in person's name for the page chrome, or null.
 *
 * This is a display value and nothing more. Anything that decides what a
 * person may see or do must call getCurrentUser, which verifies the session.
 */
export async function getDisplayName(): Promise<string | null> {
	const raw = (await headers()).get(DISPLAY_NAME_HEADER);
	if (!raw) return null;
	try {
		return decodeURIComponent(raw) || null;
	} catch {
		return null;
	}
}

/** A signed-in person, and how strongly this session has proved it. */
export type CurrentUser = User & Assurance;

/**
 * The verified user, for anything that gates access or reads their data.
 *
 * Asks Supabase live (getUser), rather than checking the token locally as the
 * middleware does, so a session that was signed out or revoked is refused at
 * once and not only when its access token expires (OWASP ASVS 3.3.1: logout
 * and expiration invalidate the session token). It costs one round trip to
 * the Auth server per request; cache() keeps it to one however many
 * components ask.
 *
 * The level (aal) is read from the same token that check just accepted, with
 * the authenticators it answered with. On its own it lets no one in: pages
 * and actions ask requireUser or actingUser (lib/require-user.ts), and the
 * database gives an owner, admin or organizer their role only at aal2.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
	const supabase = await createClient();
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session) return null;
	// Nothing in the session is believed before this: it came from a cookie.
	const {
		data: { user },
	} = await supabase.auth.getUser(session.access_token);
	if (!user) return null;
	return { ...user, ...assuranceOf(session.access_token, user.factors) };
});
