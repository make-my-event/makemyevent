"use client";

import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

/**
 * Once per page load for a signed-in user, asks the API to attach any team or
 * volunteer invitations sent to their verified email (users.claimPendingInvites).
 * This is how someone who was already signed in when an organizer invited them
 * gets access after a refresh. If anything was attached, cached queries are
 * refreshed so the new access shows up immediately. Renders nothing.
 */
export function PendingInvitesClaimer(): null {
	const { status } = useSession();
	const utils = trpc.useUtils();
	const attempted = useRef(false);
	const { mutate } = trpc.users.claimPendingInvites.useMutation({
		onSuccess: (result) => {
			if (result.linked > 0) void utils.invalidate();
		},
	});

	useEffect(() => {
		if (status !== "authenticated" || attempted.current) return;
		attempted.current = true;
		mutate();
	}, [status, mutate]);

	return null;
}
