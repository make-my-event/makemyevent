import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "db";
import { RATE_LIMITS, consumeRateLimit } from "../lib/rate-limit";
import {
	consumeAccountToken,
	issueAccountToken,
	peekAccountToken,
	revokeAccountTokens,
} from "./account-tokens";
import {
	sendAccountExistsEmail,
	sendPasswordResetEmail,
	sendVerificationEmail,
} from "./email.service";

/**
 * Password accounts: sign-up, sign-in checks, email verification, password
 * reset, and the Google/GitHub sign-in rule. See docs/security.md.
 *
 * Trust model for a password:
 * - A password is trusted once its owner has proven control of the inbox:
 *   verifying the email (which also asks for the password) or resetting it
 *   through an emailed link.
 * - A Google/GitHub sign-in proves inbox ownership by itself. If it lands on a
 *   password account whose email was never verified, that password may have
 *   been planted by someone else (pre-account takeover): it is removed and
 *   every session is signed out.
 */

export const BCRYPT_COST = 12;
const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores everything after 72 bytes. */
const PASSWORD_MAX_BYTES = 72;

/** User-facing problem with a new password, or null if it is acceptable. */
export function passwordProblem(password: string): string | null {
	if (password.length < PASSWORD_MIN_LENGTH) {
		return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
	}
	if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
		return "Password is too long.";
	}
	return null;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Fire-and-forget email with logged failures (never blocks the response). */
function deliver(promise: Promise<unknown>, what: string): void {
	promise.catch((err) => console.error(`[accounts] ${what} failed:`, err));
}

/** True when emails to this address (and from this IP) may be sent now. */
async function mayEmail(
	client: PrismaClient,
	email: string,
	ip: string | null,
): Promise<boolean> {
	const [byAddress, byIp] = await Promise.all([
		consumeRateLimit(client, RATE_LIMITS.accountEmailAddress, email),
		consumeRateLimit(client, RATE_LIMITS.accountEmailIp, ip ?? "unknown"),
	]);
	return byAddress.allowed && byIp.allowed;
}

// A real bcrypt hash of a random value, compared against when the user does
// not exist, so sign-in takes the same time either way.
let dummyHashPromise: Promise<string> | null = null;
const dummyHash = () => {
	dummyHashPromise ??= bcrypt.hash(`dummy-${Math.random()}`, BCRYPT_COST);
	return dummyHashPromise;
};

export const GENERIC_SIGNUP_MESSAGE =
	"Check your email to finish creating your account. If you already have an account, we sent you a sign-in reminder instead.";

/**
 * Sign-up. The response never reveals whether the email is registered: a new
 * address gets a verification link, an existing one gets an "account exists"
 * notice, and the same password hashing work is done either way.
 */
export async function registerAccount(
	client: PrismaClient,
	input: { name: string | null; email: string; password: string },
	ip: string | null,
): Promise<void> {
	const email = normalizeEmail(input.email);
	const problem = passwordProblem(input.password);
	if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });

	const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
	const existing = await client.user.findUnique({
		where: { email },
		select: { id: true },
	});

	if (!existing) {
		try {
			await client.user.create({
				data: { name: input.name, email, passwordHash },
				select: { id: true },
			});
		} catch (error) {
			// Concurrent sign-up with the same email: fall through to the notice.
			if ((error as { code?: string }).code !== "P2002") throw error;
			if (await mayEmail(client, email, ip)) {
				deliver(
					sendAccountExistsEmail({ toEmail: email }),
					"account-exists email",
				);
			}
			return;
		}
		if (await mayEmail(client, email, ip)) {
			const token = await issueAccountToken(client, "verify-email", email);
			deliver(
				sendVerificationEmail({ toEmail: email, token }),
				"verification email",
			);
		}
		return;
	}

	if (await mayEmail(client, email, ip)) {
		deliver(sendAccountExistsEmail({ toEmail: email }), "account-exists email");
	}
}

export type CredentialsResult =
	| {
			ok: true;
			user: {
				id: string;
				email: string;
				name: string | null;
				image: string | null;
				role: string;
			};
	  }
	| { ok: false; reason: "invalid" | "rate_limited" | "unverified" };

/**
 * Password sign-in. Rate limits are checked before any lookup or hashing; a
 * missing user still costs one bcrypt comparison; an unverified email is only
 * reported after the password is proven correct, so it reveals nothing to
 * someone guessing.
 */
export async function checkCredentials(
	client: PrismaClient,
	rawEmail: string,
	password: string,
	ip: string | null,
): Promise<CredentialsResult> {
	const email = normalizeEmail(rawEmail);
	const source = ip ?? "unknown";
	const limits = await Promise.all([
		consumeRateLimit(client, RATE_LIMITS.loginEmailIp, `${email}|${source}`),
		consumeRateLimit(client, RATE_LIMITS.loginEmail, email),
		consumeRateLimit(client, RATE_LIMITS.loginIp, source),
	]);
	if (limits.some((result) => !result.allowed)) {
		return { ok: false, reason: "rate_limited" };
	}

	const user = await client.user.findUnique({
		where: { email },
		select: {
			id: true,
			email: true,
			name: true,
			image: true,
			role: true,
			passwordHash: true,
			emailVerified: true,
			emailVerificationExempt: true,
		},
	});

	const valid = await bcrypt.compare(
		password,
		user?.passwordHash ?? (await dummyHash()),
	);
	if (!user?.passwordHash || !valid) return { ok: false, reason: "invalid" };

	if (!user.emailVerified && !user.emailVerificationExempt) {
		return { ok: false, reason: "unverified" };
	}

	return {
		ok: true,
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			role: user.role,
		},
	};
}

const invalidLink = () =>
	new TRPCError({
		code: "BAD_REQUEST",
		message:
			"This link is not valid. It may have expired or been replaced by a newer one.",
	});

/**
 * Completes email verification. Requires the account's password, so clicking
 * a verification link for an account someone else created with your address
 * cannot activate their password.
 */
export async function verifyEmail(
	client: PrismaClient,
	token: string,
	password: string,
): Promise<void> {
	const email = await peekAccountToken(client, "verify-email", token);
	if (!email) throw invalidLink();

	const user = await client.user.findUnique({
		where: { email },
		select: { id: true, passwordHash: true },
	});
	const valid =
		user?.passwordHash !== null &&
		user?.passwordHash !== undefined &&
		(await bcrypt.compare(password, user.passwordHash));
	if (!user || !valid) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message:
				"That password doesn't match this account. If you didn't create it, use Forgot password to take it over.",
		});
	}

	if ((await consumeAccountToken(client, "verify-email", token)) !== email) {
		throw invalidLink();
	}
	await client.user.update({
		where: { id: user.id },
		data: { emailVerified: new Date() },
		select: { id: true },
	});
}

/** Sends a new verification link to an unverified password account. */
export async function resendVerification(
	client: PrismaClient,
	rawEmail: string,
	ip: string | null,
): Promise<void> {
	const email = normalizeEmail(rawEmail);
	if (!(await mayEmail(client, email, ip))) return;
	const user = await client.user.findUnique({
		where: { email },
		select: { passwordHash: true, emailVerified: true },
	});
	if (!user?.passwordHash || user.emailVerified) return;
	const token = await issueAccountToken(client, "verify-email", email);
	deliver(
		sendVerificationEmail({ toEmail: email, token }),
		"verification email",
	);
}

/** Emails a reset link if the account exists. Same outcome either way. */
export async function requestPasswordReset(
	client: PrismaClient,
	rawEmail: string,
	ip: string | null,
): Promise<void> {
	const email = normalizeEmail(rawEmail);
	if (!(await mayEmail(client, email, ip))) return;
	const user = await client.user.findUnique({
		where: { email },
		select: { id: true },
	});
	if (!user) return;
	const token = await issueAccountToken(client, "reset-password", email);
	deliver(
		sendPasswordResetEmail({ toEmail: email, token }),
		"password reset email",
	);
}

/**
 * Sets a new password from a reset link. Opening the link proves inbox
 * access, so the email becomes verified; every session is signed out.
 */
export async function resetPassword(
	client: PrismaClient,
	token: string,
	newPassword: string,
): Promise<void> {
	const problem = passwordProblem(newPassword);
	if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });

	const email = await consumeAccountToken(client, "reset-password", token);
	if (!email) throw invalidLink();

	const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
	const user = await client.user.findUnique({
		where: { email },
		select: { id: true, emailVerified: true },
	});
	if (!user) throw invalidLink();

	await client.$transaction([
		client.user.update({
			where: { id: user.id },
			data: {
				passwordHash,
				emailVerified: user.emailVerified ?? new Date(),
				emailVerificationExempt: false,
			},
			select: { id: true },
		}),
		client.session.deleteMany({ where: { userId: user.id } }),
	]);
	await revokeAccountTokens(client, "verify-email", email);
}

/** OAuth providers whose sign-in proves the email (see auth.ts). */
const EMAIL_VERIFYING_PROVIDERS = new Set(["google", "github"]);

/**
 * Runs before a Google/GitHub sign-in is accepted. Returns false to refuse it.
 *
 * - The provider must confirm the email is verified (Google's
 *   email_verified claim; GitHub's /user/emails `verified` flag).
 * - If the email belongs to a password account whose email was never
 *   verified, the password is untrusted: it is removed, the email is marked
 *   verified, every session is signed out and pending links are revoked. The
 *   sign-in then links to that account as before.
 */
export async function prepareOAuthSignIn(
	client: PrismaClient,
	input: {
		provider: string;
		email: string | null | undefined;
		providerEmailVerified: boolean | undefined;
	},
): Promise<boolean> {
	if (!EMAIL_VERIFYING_PROVIDERS.has(input.provider)) return true;
	if (!input.email) return false;
	// The provider must confirm this exact address is verified (Google:
	// email_verified claim; GitHub: checked via its API, see github-email.ts).
	if (input.providerEmailVerified !== true) return false;

	const email = normalizeEmail(input.email);
	const user = await client.user.findUnique({
		where: { email },
		select: { id: true, passwordHash: true, emailVerified: true },
	});
	if (!user) return true;

	if (user.passwordHash && !user.emailVerified) {
		await client.$transaction([
			client.user.update({
				where: { id: user.id },
				data: {
					passwordHash: null,
					emailVerified: new Date(),
					emailVerificationExempt: false,
				},
				select: { id: true },
			}),
			client.session.deleteMany({ where: { userId: user.id } }),
		]);
		await revokeAccountTokens(client, "verify-email", email);
		await revokeAccountTokens(client, "reset-password", email);
	} else if (!user.emailVerified) {
		await client.user.update({
			where: { id: user.id },
			data: { emailVerified: new Date() },
			select: { id: true },
		});
	}
	return true;
}

/** Marks a user created through Google/GitHub as having a verified email. */
export async function markOAuthUserVerified(
	client: PrismaClient,
	userId: string,
): Promise<void> {
	await client.user.updateMany({
		where: { id: userId, emailVerified: null },
		data: { emailVerified: new Date() },
	});
}
