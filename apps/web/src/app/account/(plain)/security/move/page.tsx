import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetupFlow } from "@/app/signin/setup/setup-flow";
import { TwoStepShell } from "@/app/signin/two-step-shell";
import { requireUser, setupHref, verifyHref } from "@/lib/require-user";
import { isFresh } from "@/lib/two-step";

export const metadata: Metadata = {
	title: "Move to a new phone",
	robots: { index: false, follow: false },
};

/** Two-step sign-in, moved to another authenticator app. */
export default async function MovePage() {
	const here = "/account/security/move";
	const user = await requireUser(here, "self");
	if (!user.hasAuthenticator) redirect(setupHref("/account/security"));
	// A code from the old app first. Finishing gives one from the new, so the
	// page stays as it is while it shows the result.
	if (!isFresh(user, new Date())) redirect(`${verifyHref(here)}&again=1`);

	return (
		<TwoStepShell>
			<SetupFlow next="/account/security" email={user.email ?? ""} isOn move />
		</TwoStepShell>
	);
}
