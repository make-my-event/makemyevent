import { MinimalHeader } from "@/components/layout/minimal-header";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { type JSX, Suspense } from "react";

export default function OnboardingPage(): JSX.Element {
	return (
		<div className="flex min-h-dvh flex-col bg-paper">
			<MinimalHeader />

			<main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-12 md:px-6 md:py-16 lg:px-8">
				<Suspense
					fallback={
						<p role="status" className="label p-8 text-center text-ink/70">
							Loading…
						</p>
					}
				>
					<OnboardingFlow />
				</Suspense>
			</main>
		</div>
	);
}
