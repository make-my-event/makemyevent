"use client";

import { trpc } from "@/lib/trpc";
import { Mail, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

const KIND_LABEL = {
	organization: "organization",
	community: "community",
	event: "event team",
} as const;

/**
 * Shows a signed-in user the team invitations sent to their verified email and
 * lets them accept or decline each one. Nothing is joined until they choose
 * Accept (see apps/api/src/services/invites.ts). Loaded once per page load, so
 * an invitation sent while someone is signed in appears after a refresh.
 */
export function PendingInvitesNotice(): JSX.Element | null {
	const { status } = useSession();
	const router = useRouter();
	const utils = trpc.useUtils();
	const [hidden, setHidden] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { data: invites } = trpc.invites.listMine.useQuery(undefined, {
		enabled: status === "authenticated",
		refetchOnWindowFocus: false,
	});

	const respond = trpc.invites.respond.useMutation({
		onSuccess: async (result) => {
			setError(null);
			await utils.invalidate();
			if (result.targetPath) router.push(result.targetPath);
		},
		onError: (err) => setError(err.message),
	});

	if (hidden || !invites || invites.length === 0) return null;

	return (
		<section
			aria-label="Team invitations"
			className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-paper border border-perforation rounded-lg shadow-xl p-4 space-y-4"
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2 text-ink">
					<Mail className="w-4 h-4 text-stamp" aria-hidden="true" />
					<h2 className="font-display font-semibold text-sm">
						{invites.length === 1
							? "You have a team invitation"
							: `You have ${invites.length} team invitations`}
					</h2>
				</div>
				<button
					type="button"
					onClick={() => setHidden(true)}
					className="text-ink/60 hover:text-ink p-1 rounded"
					aria-label="Hide invitations until next visit"
				>
					<X className="w-4 h-4" />
				</button>
			</div>

			<ul className="space-y-2">
				{invites.map((invite) => {
					const busy = respond.isPending && respond.variables?.id === invite.id;
					return (
						<li
							key={`${invite.kind}-${invite.id}`}
							className="border border-perforation rounded-md p-4 space-y-2"
						>
							<p className="text-sm text-ink">
								Join <strong>{invite.targetName}</strong>{" "}
								{KIND_LABEL[invite.kind]} as{" "}
								<strong>{invite.role.toLowerCase()}</strong>
							</p>
							<div className="flex gap-2">
								<button
									type="button"
									disabled={respond.isPending}
									onClick={() =>
										respond.mutate({
											kind: invite.kind,
											id: invite.id,
											accept: true,
										})
									}
									className="px-4 py-1 bg-stamp text-paper rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-50"
								>
									{busy && respond.variables?.accept
										? "Accepting..."
										: "Accept"}
								</button>
								<button
									type="button"
									disabled={respond.isPending}
									onClick={() =>
										respond.mutate({
											kind: invite.kind,
											id: invite.id,
											accept: false,
										})
									}
									className="px-4 py-1 border border-perforation text-ink rounded-md text-xs font-medium hover:bg-perforation/30 disabled:opacity-50"
								>
									{busy && !respond.variables?.accept
										? "Declining..."
										: "Decline"}
								</button>
							</div>
						</li>
					);
				})}
			</ul>

			{error && (
				<p role="alert" className="text-xs text-alert">
					{error}
				</p>
			)}
		</section>
	);
}
