import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/lib/supabase/identity";
import { CodeForm } from "../code-form";
import styles from "../signin.module.css";
import twoStep from "../two-step.module.css";
import { SignOutInstead, TwoStepShell } from "../two-step-shell";

export const metadata: Metadata = {
	title: "Enter your code",
	robots: { index: false, follow: false },
};

type Props = {
	searchParams: Promise<{
		next?: string | string[];
		again?: string | string[];
	}>;
};

/** The second step: a code from the authenticator app. */
export default async function VerifyPage({ searchParams }: Props) {
	const params = await searchParams;
	const next = safeRedirectPath(
		typeof params.next === "string" ? params.next : null,
	);
	// Asked again before a change, though this session gave one earlier.
	const again = params.again === "1";

	const user = await getCurrentUser();
	if (!user) redirect(`/signin?${new URLSearchParams({ next })}`);
	if (!user.hasAuthenticator || (user.aal === "aal2" && !again)) redirect(next);

	return (
		<TwoStepShell>
			<h1 className={styles.title}>Enter your code</h1>
			<p className={styles.lede}>
				{again
					? "This change affects how you sign in, so confirm it's you with a code from your authenticator app."
					: "Open your authenticator app and enter the code it shows for makemyevent."}
			</p>
			<CodeForm kind="app" next={next} />
			<div className={twoStep.others}>
				<Link
					className={`${styles.btn} ${styles.btnQuiet}`}
					href={`/signin/recovery?${new URLSearchParams({ next })}`}
				>
					I can&rsquo;t use my authenticator app
				</Link>
				<SignOutInstead />
			</div>
		</TwoStepShell>
	);
}
