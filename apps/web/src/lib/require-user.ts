import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { claimInvites } from "@/app/dashboard/claim-invites";
import { asUser } from "./db";
import { type CurrentUser, getCurrentUser } from "./supabase/identity";
import { type Need, type NextStep, nextStep } from "./two-step";

function to(path: string, next: string): string {
	return `${path}?${new URLSearchParams({ next })}`;
}

export const verifyHref = (next: string) => to("/signin/verify", next);
export const setupHref = (next: string) => to("/signin/setup", next);

/**
 * Whether this person hosts an event with people in it (more than a private
 * draft), or is an admin or organizer of one.
 * Invitations to their email are claimed first, so someone invited as an
 * organizer is asked on their first visit. Asked only of people who are not
 * at aal2; everyone else has no need of the answer.
 */
const runsEvents = cache(
	async (user: CurrentUser): Promise<boolean> =>
		asUser(user, async (tx) => {
			await claimInvites(tx, user);
			const [row] = await tx.$queryRaw<{ runs: boolean }[]>`
			SELECT app.runs_events() AS runs
		`;
			return row?.runs ?? false;
		}),
);

/** Whether this person must keep two-step sign-in on. */
export function mustKeepTwoStep(user: CurrentUser): Promise<boolean> {
	return runsEvents(user);
}

function send(step: NextStep, next: string): void {
	if (step === "enter_code") redirect(verifyHref(next));
	if (step === "set_up") redirect(setupHref(next));
}

/**
 * The gate for a page: the signed-in person, once they have proved as much
 * as the page needs (see Need). Otherwise they are sent to sign in, to enter
 * a code, or to set up an authenticator, and back to `next` afterwards.
 *
 * This decides what someone is asked for. What they can read and change is
 * the database's answer, which gives an owner, admin or organizer no role
 * below aal2 whatever page or action let them by.
 */
export async function requireUser(
	next: string,
	need: Need,
): Promise<CurrentUser> {
	const user = await getCurrentUser();
	if (!user) redirect(to("/signin", next));
	const asked =
		need === "team" && user.aal === "aal1" && !user.hasAuthenticator;
	send(nextStep(user, need, asked && (await runsEvents(user))), next);
	return user;
}

/**
 * Where to go before bringing someone into an event, or null to go ahead:
 * for a button that would invite a guest or add to the team, so the person
 * is sent to set up two-step sign-in instead of meeting an error.
 */
export function twoStepFirst(
	user: Pick<CurrentUser, "aal" | "hasAuthenticator">,
	next: string,
): string | null {
	const step = nextStep(user, "people", false);
	return step === "go"
		? null
		: step === "enter_code"
			? verifyHref(next)
			: setupHref(next);
}

/**
 * The same for a server action. Someone with an authenticator must have used
 * it; whether the rest need one was settled by the page, and is enforced by
 * the database, so it is not asked again on every write.
 */
export async function actingUser(next = "/dashboard"): Promise<CurrentUser> {
	return requireUser(next, "self");
}

/**
 * For a server action that brings someone into an event: a guest, a team
 * member. The database refuses these below aal2 anyway; this sends the
 * person to set up or enter a code, and back, instead.
 */
export function bringingPeopleIn(next: string): Promise<CurrentUser> {
	return requireUser(next, "people");
}
