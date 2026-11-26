import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyHref } from "@/lib/require-user";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/lib/supabase/identity";
import { SignOutInstead, TwoStepShell } from "../two-step-shell";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = {
	title: "Set up two-step sign-in",
	robots: { index: false, follow: false },
};

type Props = {
	searchParams: Promise<{
		next?: string | string[];
		recovered?: string | string[];
	}>;
};

/**
 * Setting up an authenticator app. Moving to a new phone is a page of its own
 * (/account/security/move), over the same flow.
 *
 * Finishing it signs the session in again at aal2, and writing those cookies
 * renders this page once more, under the recovery codes it has just given
 * out. So someone who already has an authenticator is not sent on from here:
 * the flow shows what it was showing, or says it is on.
 */
export default async function SetupPage({ searchParams }: Props) {
	const params = await searchParams;
	const next = safeRedirectPath(
		typeof params.next === "string" ? params.next : null,
	);
	const user = await getCurrentUser();
	if (!user) redirect(`/signin?${new URLSearchParams({ next })}`);
	if (user.hasAuthenticator && user.aal === "aal1") redirect(verifyHref(next));

	return (
		<TwoStepShell>
			<SetupFlow
				next={next}
				email={user.email ?? ""}
				isOn={user.hasAuthenticator}
				recovered={params.recovered === "1"}
			/>
			{user.hasAuthenticator ? null : <SignOutInstead />}
		</TwoStepShell>
	);
}
