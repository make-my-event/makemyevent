"use client";

import { SiteHeader } from "@/components/layout/site-header";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Check, Mail } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

const KIND_LABEL = {
	organization: "organization",
	community: "community",
	event: "event team",
} as const;

/**
 * Landing page for an emailed team invitation. Shows what the invitation is
 * for and lets the recipient accept it with their signed-in account, or
 * decline it. The token is single-use and expires (apps/api/src/services/invites.ts).
 */
export default function InvitePage(): JSX.Element {
	const params = useParams();
	const token = params.token as string;
	const router = useRouter();
	const { status } = useSession();
	const [declined, setDeclined] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const {
		data: invite,
		error,
		isLoading,
	} = trpc.invites.getByToken.useQuery(
		{ token },
		{ enabled: !!token, retry: false, refetchOnWindowFocus: false },
	);

	const accept = trpc.invites.acceptByToken.useMutation({
		onSuccess: (result) => router.push(result.targetPath),
		onError: (err) => setActionError(err.message),
	});
	const decline = trpc.invites.declineByToken.useMutation({
		onSuccess: () => setDeclined(true),
		onError: (err) => setActionError(err.message),
	});

	const loginHref = `/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`;

	return (
		<div className="min-h-screen bg-paper flex flex-col">
			<SiteHeader />
			<main className="flex-1 flex items-center justify-center p-4">
				<div className="w-full max-w-md border border-perforation rounded-lg p-8 space-y-6 text-center">
					{isLoading || status === "loading" ? (
						<p className="text-sm text-ink/60">Loading invitation...</p>
					) : error ? (
						<>
							<AlertCircle
								className="w-8 h-8 text-alert mx-auto"
								aria-hidden="true"
							/>
							<h1 className="font-display font-semibold text-xl text-ink">
								Invitation not available
							</h1>
							<p className="text-sm text-ink/70">{error.message}</p>
							<Link href="/" className="text-sm text-stamp underline">
								Go to makemyevent
							</Link>
						</>
					) : declined ? (
						<>
							<Check
								className="w-8 h-8 text-stamp mx-auto"
								aria-hidden="true"
							/>
							<h1 className="font-display font-semibold text-xl text-ink">
								Invitation declined
							</h1>
							<p className="text-sm text-ink/70">
								The organizer can send a new invitation if you change your mind.
							</p>
						</>
					) : invite ? (
						<>
							<Mail className="w-8 h-8 text-stamp mx-auto" aria-hidden="true" />
							<h1 className="font-display font-semibold text-xl text-ink">
								Join {invite.targetName}
							</h1>
							<p className="text-sm text-ink/70">
								You have been invited to the {KIND_LABEL[invite.kind]} as{" "}
								<strong>{invite.role.toLowerCase()}</strong>. This invitation
								was sent to {invite.emailHint}.
							</p>

							{invite.expired ? (
								<p role="alert" className="text-sm text-alert">
									This invitation has expired. Ask the organizer to send you a
									new one.
								</p>
							) : (
								<div className="space-y-2">
									{status === "authenticated" ? (
										<button
											type="button"
											disabled={accept.isPending || decline.isPending}
											onClick={() => accept.mutate({ token })}
											className="w-full py-2 bg-stamp text-paper rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
										>
											{accept.isPending ? "Accepting..." : "Accept invitation"}
										</button>
									) : (
										<Link
											href={loginHref}
											className="block w-full py-2 bg-stamp text-paper rounded-md text-sm font-medium hover:opacity-90"
										>
											Sign in to accept
										</Link>
									)}
									<button
										type="button"
										disabled={accept.isPending || decline.isPending}
										onClick={() => decline.mutate({ token })}
										className="w-full py-2 border border-perforation text-ink rounded-md text-sm font-medium hover:bg-perforation/30 disabled:opacity-50"
									>
										{decline.isPending ? "Declining..." : "Decline"}
									</button>
								</div>
							)}

							{actionError && (
								<p role="alert" className="text-sm text-alert">
									{actionError}
								</p>
							)}
						</>
					) : null}
				</div>
			</main>
		</div>
	);
}
