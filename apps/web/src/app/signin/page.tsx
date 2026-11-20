import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/lib/supabase/identity";
import { SignInForm, type UrlError } from "./sign-in-form";
import styles from "./signin.module.css";

export const metadata: Metadata = {
	title: "Sign in",
	robots: { index: false, follow: false },
};

const URL_ERRORS: readonly UrlError[] = ["link_invalid", "cancelled", "failed"];

type Props = {
	searchParams: Promise<{
		next?: string | string[];
		error?: string | string[];
	}>;
};

export default async function SignInPage({ searchParams }: Props) {
	const params = await searchParams;
	const next = safeRedirectPath(
		typeof params.next === "string" ? params.next : null,
	);
	const urlError = URL_ERRORS.find((code) => code === params.error) ?? null;

	// Verified, not the display name from the middleware: this decides
	// whether someone is sent on to their account.
	const user = await getCurrentUser();

	return (
		<div className={styles.shell}>
			<div className={styles.page}>
				<main className={styles.formSide}>
					<div className={styles.bar}>
						<Brand className={styles.barBrand} />
						<ThemeToggle />
					</div>

					<div className={styles.formInner}>
						{user ? (
							<>
								<h1 className={styles.title}>You're signed in</h1>
								<p className={styles.lede}>
									Signed in as{" "}
									<strong className={styles.strong}>{user.email}</strong>.
								</p>
								<div className={styles.actions}>
									<a
										className={`${styles.btn} ${styles.btnPrimary}`}
										href={next}
									>
										Continue
									</a>
									<form action="/auth/signout" method="post">
										<button
											type="submit"
											className={`${styles.btn} ${styles.btnSecondary}`}
										>
											Sign out
										</button>
									</form>
								</div>
							</>
						) : (
							<SignInForm next={next} urlError={urlError} />
						)}
					</div>
				</main>

				{/* The pitch comes after the form in the page so keyboard and screen-reader users reach
            the form first. From 1024px CSS places it in the left half. */}
				<aside className={styles.pitchSide} aria-label="About makemyevent">
					<Brand className={styles.pitchBrand} />

					<div>
						<p className={styles.pitch}>
							From the first registration to the last scan at the door.
						</p>
						<p className={styles.pitchSub}>
							Tickets, passes and check-in for community events. Open source,
							and yours to self-host.
						</p>

						<ul className={styles.points}>
							<li>
								<svg
									viewBox="0 0 20 20"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M2.5 6.5h15v2.2a1.3 1.3 0 0 0 0 2.6v2.2h-15v-2.2a1.3 1.3 0 0 0 0-2.6Z" />
									<path d="M12 6.8v6.4" strokeDasharray="1.4 1.6" />
								</svg>
								Tickets, RSVPs and waitlists in one place
							</li>
							<li>
								<svg
									viewBox="0 0 20 20"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<rect x="2.5" y="2.5" width="6" height="6" rx="1" />
									<rect x="11.5" y="2.5" width="6" height="6" rx="1" />
									<rect x="2.5" y="11.5" width="6" height="6" rx="1" />
									<path d="M11.5 11.5h2.5v2.5M17.5 14v3.5h-3.5" />
								</svg>
								A QR pass for every attendee
							</li>
							<li>
								<svg
									viewBox="0 0 20 20"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M6.5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 16V4a1.5 1.5 0 0 1 1.5-1.5Z" />
									<path d="m7.8 10.2 1.5 1.5 3-3" />
								</svg>
								Check in at the door from any phone
							</li>
						</ul>
					</div>

					<nav className={styles.pitchFoot} aria-label="Legal">
						<a className={styles.link} href="/privacy">
							Privacy policy
						</a>
						<a className={styles.link} href="/terms">
							Terms of service
						</a>
						<a className={styles.link} href="mailto:admin@makemyevent.org">
							Contact
						</a>
					</nav>
				</aside>
			</div>
		</div>
	);
}
