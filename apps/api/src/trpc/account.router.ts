import { z } from "zod";
import { RATE_LIMITS, enforceRateLimits } from "../lib/rate-limit";
import {
	requestPasswordReset,
	resendVerification,
	resetPassword,
	verifyEmail,
} from "../services/accounts";
import { publicProcedure, router } from "./trpc";

/** Account tokens are 32 random bytes, base64url-encoded (43 characters). */
const token = z.string().min(40).max(64);
const email = z.string().trim().email().max(254);

const SENT_IF_ELIGIBLE =
	"If that email belongs to an account that needs it, we've sent a link. Check your inbox.";

/**
 * Email verification and password reset for password accounts. The rules
 * live in services/accounts.ts. Endpoints that send email answer the same way
 * whether or not the address has an account.
 */
export const accountRouter = router({
	verifyEmail: publicProcedure
		.input(z.object({ token, password: z.string().min(1).max(200) }))
		.mutation(async ({ ctx, input }) => {
			await enforceRateLimits(ctx.prisma, [
				{ rule: RATE_LIMITS.accountTokenUseIp, identifier: ctx.clientIp },
			]);
			await verifyEmail(ctx.prisma, input.token, input.password);
			return { verified: true as const };
		}),

	resendVerification: publicProcedure
		.input(z.object({ email }))
		.mutation(async ({ ctx, input }) => {
			await resendVerification(ctx.prisma, input.email, ctx.clientIp);
			return { message: SENT_IF_ELIGIBLE };
		}),

	requestPasswordReset: publicProcedure
		.input(z.object({ email }))
		.mutation(async ({ ctx, input }) => {
			await requestPasswordReset(ctx.prisma, input.email, ctx.clientIp);
			return { message: SENT_IF_ELIGIBLE };
		}),

	resetPassword: publicProcedure
		.input(z.object({ token, newPassword: z.string().min(1).max(200) }))
		.mutation(async ({ ctx, input }) => {
			await enforceRateLimits(ctx.prisma, [
				{ rule: RATE_LIMITS.accountTokenUseIp, identifier: ctx.clientIp },
			]);
			await resetPassword(ctx.prisma, input.token, input.newPassword);
			return { reset: true as const };
		}),
});
