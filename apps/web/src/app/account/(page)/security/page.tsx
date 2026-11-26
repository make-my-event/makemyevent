import type { Metadata } from "next";
import { mustKeepTwoStep, requireUser, setupHref } from "@/lib/require-user";
import { verifiedTotp } from "@/lib/two-step";
import { recoveryCodesLeft } from "@/lib/two-step-store";
import styles from "@/app/signin/two-step.module.css";
import { SecurityPanel } from "./security-panel";

export const metadata: Metadata = {
	title: "Account security",
	robots: { index: false, follow: false },
};

const HERE = "/account/security";

/** A person's two-step sign-in, recovery codes and other devices. */
export default async function SecurityPage() {
	const user = await requireUser(HERE, "self");
	const [required, codesLeft] = await Promise.all([
		mustKeepTwoStep(user),
		user.hasAuthenticator ? recoveryCodesLeft(user) : 0,
	]);
	const added = verifiedTotp(user.factors)[0]?.created_at;

	return (
		<main className={styles.page}>
			<h1 className={styles.h1}>Account security</h1>
			<SecurityPanel
				isOn={user.hasAuthenticator}
				required={required}
				codesLeft={codesLeft}
				since={
					added
						? new Intl.DateTimeFormat("en-US", {
								dateStyle: "long",
								timeZone: "UTC",
							}).format(new Date(added))
						: null
				}
				setupHref={setupHref(HERE)}
			/>
		</main>
	);
}
