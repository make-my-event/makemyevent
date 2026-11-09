import { z } from "zod";
import {
	acceptInviteByToken,
	declineInviteByToken,
	listMyPendingInvites,
	previewInviteByToken,
	respondToMyInvite,
} from "../services/invites";
import { authedProcedure, publicProcedure, router } from "./trpc";

/** Tokens are 32 random bytes, base64url-encoded (43 characters). */
const tokenInput = z.object({ token: z.string().min(40).max(64) });

const kindInput = z.enum(["organization", "community", "event"]);

/**
 * Team invitation endpoints. The rules (single-use hashed tokens, expiry,
 * explicit acceptance, verified-email matching for in-app invitations) live in
 * services/invites.ts.
 */
export const invitesRouter = router({
	/** What an invitation link is for, shown on /invite/[token]. */
	getByToken: publicProcedure
		.input(tokenInput)
		.query(({ ctx, input }) => previewInviteByToken(ctx.prisma, input.token)),

	/** Accept an invitation link with the signed-in account. */
	acceptByToken: authedProcedure
		.input(tokenInput)
		.mutation(({ ctx, input }) =>
			acceptInviteByToken(ctx.prisma, input.token, ctx.userId),
		),

	/** Decline an invitation link. Holding the link is the authorization. */
	declineByToken: publicProcedure
		.input(tokenInput)
		.mutation(async ({ ctx, input }) => {
			await declineInviteByToken(ctx.prisma, input.token);
			return { declined: true };
		}),

	/** Pending invitations sent to the signed-in user's verified email. */
	listMine: authedProcedure.query(({ ctx }) =>
		listMyPendingInvites(ctx.prisma, ctx.userId),
	),

	/** Accept or decline one of listMine's invitations. */
	respond: authedProcedure
		.input(
			z.object({
				kind: kindInput,
				id: z.string().max(64),
				accept: z.boolean(),
			}),
		)
		.mutation(({ ctx, input }) =>
			respondToMyInvite(ctx.prisma, ctx.userId, input),
		),
});
