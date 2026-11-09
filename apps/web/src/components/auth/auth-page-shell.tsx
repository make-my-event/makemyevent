import Link from "next/link";
import { type JSX, type ReactNode, Suspense } from "react";

export interface AuthPageShellProps {
	children: ReactNode;
}

/** Header and centred layout shared by the sign-in and account pages. */
export function AuthPageShell({ children }: AuthPageShellProps): JSX.Element {
	return (
		<div className="min-h-screen bg-paper flex flex-col">
			<header className="border-b border-perforation py-4">
				<div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8">
					<Link
						href="/"
						className="font-display font-semibold text-h3 text-ink"
					>
						makemyevent
					</Link>
				</div>
			</header>
			<main className="flex-1 max-w-[1280px] w-full mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-24 flex items-center justify-center">
				<Suspense
					fallback={
						<div className="p-8 text-center text-ink/60 label">Loading...</div>
					}
				>
					{children}
				</Suspense>
			</main>
		</div>
	);
}
