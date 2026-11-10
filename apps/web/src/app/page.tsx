import { CtaPanel } from "@/components/landing/cta-panel";
import { FeaturesBento } from "@/components/landing/features-bento";
import { Hero } from "@/components/landing/hero";
import { HowItWorksDemo } from "@/components/landing/how-it-works-demo";
import { Marquee } from "@/components/landing/marquee";
import type { AccountMenuUser } from "@/components/layout/account-menu";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { auth } from "@/lib/auth";
import type { JSX } from "react";

const MAIN_CONTENT_ID = "main-content";
const DASHBOARD_HREF = "/dashboard";

/**
 * Landing page. A Server Component: the session is read here so the header
 * and hero render the signed-in state on the server, with no flash. Only the
 * interactive pieces (theme toggle, account menu, ticket tilt, bento tiles,
 * how-it-works tabs) are client components.
 */
export default async function Home(): Promise<JSX.Element> {
	const session = await auth();
	// Display fields only: the header shows the name, email and avatar.
	const user: AccountMenuUser | null = session?.user
		? {
				name: session.user.name ?? null,
				email: session.user.email ?? null,
				image: session.user.image ?? null,
			}
		: null;

	return (
		<div className="flex min-h-dvh flex-col">
			<SkipLink targetId={MAIN_CONTENT_ID} />
			<SiteHeader variant="landing" user={user} />

			<main id={MAIN_CONTENT_ID} className="flex-1">
				<Hero isSignedIn={user !== null} dashboardHref={DASHBOARD_HREF} />
				<Marquee />
				<FeaturesBento />

				<section
					id="how"
					aria-labelledby="how-title"
					className="scroll-mt-24 pb-16 lg:pb-24"
				>
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 md:gap-12 md:px-6 lg:px-8">
						<h2
							id="how-title"
							className="text-center font-display text-section font-semibold font-stretch-wide text-balance"
						>
							How it works
						</h2>
						<HowItWorksDemo />
					</div>
				</section>

				<CtaPanel />
			</main>

			<SiteFooter variant="landing" />
		</div>
	);
}
