import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyHref } from "@/lib/require-user";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/lib/supabase/identity";
import { CodeForm } from "../code-form";
import styles from "../signin.module.css";
import twoStep from "../two-step.module.css";
import { SignOutInstead, TwoStepShell } from "../two-step-shell";

export const metadata: Metadata = {
	title: "Use a recovery code",
	robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** For someone without their authenticator. */
export default async function RecoveryPage({ searchParams }: Props) {
	const params = await searchParams;
	const next = safeRedirectPath(
		typeof params.next === "string" ? params.next : null,
	);
	const user = await getCurrentUser();
	if (!user) redirect(`/signin?${new URLSearchParams({ next })}`);
	if (!user.hasAuthenticator) redirect(next);

	return (
		<TwoStepShell>
			<h1 className={styles.title}>Use a recovery code</h1>
			<p className={styles.lede}>
				Enter one of the codes you saved when you set up two-step sign-in. It
				removes the authenticator app you no longer have, signs out your other
				devices, and takes you to set up a new one.
			</p>
			<CodeForm kind="recovery" next={next} />
			<div className={twoStep.others}>
				<Link
					className={`${styles.btn} ${styles.btnQuiet}`}
					href={verifyHref(next)}
				>
					Back to the 6-digit code
				</Link>
				<SignOutInstead />
			</div>
			<p className={styles.foot}>
				No codes left? Email{" "}
				<a className={styles.link} href="mailto:admin@makemyevent.org">
					admin@makemyevent.org
				</a>{" "}
				from the address you sign in with.
			</p>
		</TwoStepShell>
	);
}
