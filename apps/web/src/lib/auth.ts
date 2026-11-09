import { PrismaAdapter } from "@auth/prisma-adapter";
import { type UserRole, prisma } from "db";
import NextAuth, { CredentialsSignin } from "next-auth";
import type { Provider } from "next-auth/providers";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { cookies, headers } from "next/headers";
import { clientIpFromHeaders } from "@/../../api/src/lib/client-ip";
import {
	checkCredentials,
	markOAuthUserVerified,
	notifySignInMethodLinked,
	prepareOAuthSignIn,
} from "@/../../api/src/services/accounts";
import { isVerifiedGitHubEmail } from "@/../../api/src/services/github-email";
import { toClientSession } from "./client-session";
import { parseUserAgent } from "./device";

/** Surfaces as `code: "rate_limited"` from signIn() in the login form. */
class TooManySignInAttempts extends CredentialsSignin {
	code = "rate_limited";
}

/** Surfaces as `code: "email_unverified"` from signIn() in the login form. */
class EmailNotVerified extends CredentialsSignin {
	code = "email_unverified";
}

const providers: Provider[] = [
	CredentialsProvider({
		name: "Credentials",
		credentials: {
			email: { label: "Email", type: "email" },
			password: { label: "Password", type: "password" },
		},
		async authorize(credentials, request) {
			if (!credentials?.email || !credentials?.password) {
				return null;
			}

			// Rate limits, constant-time handling of unknown emails and the
			// email-verification rule live in apps/api/src/services/accounts.ts.
			const result = await checkCredentials(
				prisma,
				credentials.email as string,
				credentials.password as string,
				clientIpFromHeaders(request.headers),
			);
			if (result.ok)
				return { ...result.user, role: result.user.role as UserRole };
			if (result.reason === "rate_limited") throw new TooManySignInAttempts();
			if (result.reason === "unverified") throw new EmailNotVerified();
			return null;
		},
	}),
];

if (
	(process.env.AUTH_GITHUB_ID || process.env.GITHUB_CLIENT_ID) &&
	(process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_CLIENT_SECRET)
) {
	providers.push(
		GitHubProvider({
			clientId:
				process.env.AUTH_GITHUB_ID || (process.env.GITHUB_CLIENT_ID as string),
			clientSecret:
				process.env.AUTH_GITHUB_SECRET ||
				(process.env.GITHUB_CLIENT_SECRET as string),
			// Safe because the signIn callback confirms through GitHub's API that
			// the email is verified (Auth.js alone does not check). Allows
			// credential-registered users to link GitHub. If the password account's
			// email was never verified, its password is removed on link
			// (prepareOAuthSignIn), so a pre-planted password cannot survive.
			allowDangerousEmailAccountLinking: true,
		}),
	);
}

if (
	(process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID) &&
	(process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET)
) {
	providers.push(
		GoogleProvider({
			clientId:
				process.env.AUTH_GOOGLE_ID || (process.env.GOOGLE_CLIENT_ID as string),
			clientSecret:
				process.env.AUTH_GOOGLE_SECRET ||
				(process.env.GOOGLE_CLIENT_SECRET as string),
			// Safe: Google verifies email ownership (and the signIn callback
			// requires email_verified). Allows credential-registered users to link
			// Google. If the password account's email was never verified, its
			// password is removed on link (prepareOAuthSignIn).
			allowDangerousEmailAccountLinking: true,
		}),
	);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
	adapter: PrismaAdapter(prisma),
	// Rolling 30-day JWT. The Session row (device tracking, revocation) also
	// expires 30 days after sign-in, and the jwt callback rejects a token whose
	// row has expired, so sign-in is required again at least every 30 days.
	session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
	trustHost: true,
	secret: (() => {
		const s = process.env.AUTH_SECRET;
		if (!s) {
			throw new Error(
				"Missing AUTH_SECRET environment variable. Auth cannot start without a signing secret.",
			);
		}
		return s;
	})(),
	pages: {
		signIn: "/login",
	},
	providers,
	events: {
		async createUser({ user }) {
			// Only adapter-created users reach this event, i.e. Google/GitHub
			// sign-ups (password sign-ups are created by registerAccount).
			if (!user.id) return;
			try {
				await markOAuthUserVerified(prisma, user.id);
			} catch (err) {
				console.error("[auth] Marking OAuth user verified failed:", err);
			}
		},
		async linkAccount({ user, account }) {
			// Tell the owner when a Google/GitHub sign-in is added to an account
			// that already had another way in.
			if (!user.id || account.type === "credentials") return;
			try {
				await notifySignInMethodLinked(prisma, user.id, account.provider);
			} catch (err) {
				console.error("[auth] Sign-in linked notice failed:", err);
			}
		},
		async signOut(message) {
			if ("token" in message && message.token?.sessionToken) {
				try {
					await prisma.session.deleteMany({
						where: { sessionToken: message.token.sessionToken as string },
					});
				} catch (err) {
					// session cleanup ignore
					console.error(
						"[auth] Deleting the session row at sign-out failed:",
						err,
					);
				}
			}
		},
	},
	callbacks: {
		async signIn({ user, account, profile }) {
			if (!account || account.type === "credentials") return true;
			try {
				const email = user.email ?? (profile?.email as string | undefined);
				// Google states verification in the ID token; for GitHub it must be
				// checked explicitly (Auth.js does not), see github-email.ts.
				const providerEmailVerified =
					account.provider === "github"
						? Boolean(email) &&
							(await isVerifiedGitHubEmail(
								account.access_token,
								email as string,
							))
						: (profile as { email_verified?: boolean } | undefined)
								?.email_verified;
				return await prepareOAuthSignIn(prisma, {
					provider: account.provider,
					email,
					providerEmailVerified,
				});
			} catch (err) {
				// Fail closed: refuse the sign-in rather than link unsafely.
				console.error("[auth] OAuth sign-in check failed:", err);
				return false;
			}
		},
		async jwt({ token, user, profile }) {
			const userId = (user?.id || token.id || token.sub) as string | undefined;

			if (user) {
				if (userId) {
					token.id = userId;
					token.sub = userId;
				}
				token.name = user.name || profile?.name || token.name;
				token.picture =
					user.image ||
					(profile as { picture?: string })?.picture ||
					(profile as { avatar_url?: string })?.avatar_url ||
					token.picture;
				token.role = user.role || token.role;

				// Time of this actual sign-in (not refreshed later). Sensitive
				// actions such as setting a first password require it to be recent.
				token.authTime = Date.now();

				// Generate persistent session token
				const sessionToken =
					(token.sessionToken as string) || crypto.randomUUID();
				token.sessionToken = sessionToken;

				// ──────────────── Smart Device Tracking & Session Management ────────────────
				let userAgent: string | null = null;
				let ipAddress: string | null = null;
				let deviceId: string | null = null;

				try {
					const reqHeaders = await headers();
					userAgent = reqHeaders.get("user-agent") || null;
					ipAddress =
						reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
						reqHeaders.get("x-real-ip") ||
						null;
				} catch (err) {
					// safe fallback in environments where headers() is not available
					console.error(
						"[auth] Reading request headers for device tracking failed:",
						err,
					);
				}

				try {
					const cookieStore = await cookies();
					deviceId =
						cookieStore.get("makemyevent_device_id")?.value ||
						cookieStore.get("openevents_device_id")?.value ||
						null;
				} catch (err) {
					// safe fallback in environments where cookies() is not available
					console.error("[auth] Reading the device cookie failed:", err);
				}

				const { browser, os, deviceType } = parseUserAgent(userAgent);
				const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

				if (userId) {
					try {
						// 1. Match session by unique sessionToken or explicit deviceId
						let existingSession = null;
						if (sessionToken) {
							existingSession = await prisma.session.findFirst({
								where: {
									userId,
									sessionToken,
								},
							});
						}

						if (!existingSession && deviceId) {
							existingSession = await prisma.session.findFirst({
								where: {
									userId,
									deviceId,
								},
							});
						}

						if (existingSession) {
							// Reuse and update the existing device session without creating duplicates
							await prisma.session.update({
								where: { id: existingSession.id },
								data: {
									sessionToken,
									expires,
									lastActive: new Date(),
									userAgent,
									browser,
									os,
									deviceType,
									ipAddress,
									deviceId: deviceId || existingSession.deviceId,
								},
							});
						} else {
							// First login on this device -> create a new device session record
							await prisma.session.create({
								data: {
									sessionToken,
									userId,
									expires,
									lastActive: new Date(),
									userAgent,
									browser,
									os,
									deviceType,
									ipAddress,
									deviceId,
								},
							});
						}
						// Mark that session was successfully persisted. The refresh path
						// uses this flag to distinguish "never created" (safe to heal)
						// from "explicitly revoked" (must honour the revocation).
						token.sessionRecordedAt = Date.now();
					} catch (err) {
						console.error("Session recording notice:", err);
					}
				}

				// Team invitations are never joined automatically at sign-in. The
				// invitee accepts explicitly, from the emailed link or the in-app
				// notice (see apps/api/src/services/invites.ts).

				// If user exists in DB but name or image is null, sync from OAuth profile
				if (userId && profile) {
					try {
						const profileName = profile.name;
						const profileImage =
							(profile as { picture?: string })?.picture ||
							(profile as { avatar_url?: string })?.avatar_url;

						const updateData: { name?: string; image?: string } = {};
						if (!user.name && profileName) {
							updateData.name = profileName;
						}
						if (!user.image && profileImage) {
							updateData.image = profileImage;
						}

						if (Object.keys(updateData).length > 0) {
							await prisma.user.update({
								where: { id: userId },
								data: updateData,
							});
						}
					} catch (err) {
						// background sync ignore
						console.error(
							"[auth] Syncing OAuth profile name/image failed:",
							err,
						);
					}
				}
			} else if (userId) {
				// ──────────────── Token Refresh & Remote Revocation Check ────────────────
				token.id = userId;
				token.sub = userId;
				const sessionToken = token.sessionToken as string | undefined;

				if (sessionToken) {
					try {
						const activeSession = await prisma.session.findFirst({
							where: {
								userId,
								sessionToken,
								expires: { gte: new Date() },
							},
							select: { id: true, lastActive: true },
						});

						if (!activeSession) {
							// ── Distinguish "never persisted" from "explicitly revoked" ──
							// sessionRecordedAt is set only after a successful DB write.
							// If it exists, the session was known-good and its absence
							// means the user (or an admin) deliberately revoked it via
							// logoutDevice / logoutAllDevices. Honour that revocation.
							const wasRecorded = typeof token.sessionRecordedAt === "number";

							if (wasRecorded) {
								// Explicit revocation — invalidate JWT immediately
								return null;
							}

							// Session was never successfully persisted (transient DB error
							// or race during initial OAuth callback). Verify the user
							// account still exists before attempting a one-time heal.
							const dbUser = await prisma.user.findUnique({
								where: { id: userId },
								select: { id: true, name: true, image: true, role: true },
							});

							if (!dbUser) {
								// User account deleted — revoke
								return null;
							}

							// Re-create the missing session record (one-time heal)
							let userAgent: string | null = null;
							let ipAddress: string | null = null;
							let deviceId: string | null = null;

							try {
								const reqHeaders = await headers();
								userAgent = reqHeaders.get("user-agent") || null;
								ipAddress =
									reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
									reqHeaders.get("x-real-ip") ||
									null;
							} catch (err) {
								// safe fallback
								console.error(
									"[auth] Reading request headers for session healing failed:",
									err,
								);
							}

							try {
								const cookieStore = await cookies();
								deviceId =
									cookieStore.get("makemyevent_device_id")?.value ||
									cookieStore.get("openevents_device_id")?.value ||
									null;
							} catch (err) {
								// safe fallback
								console.error(
									"[auth] Reading the device cookie for session healing failed:",
									err,
								);
							}

							const { browser, os, deviceType } = parseUserAgent(userAgent);
							const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

							try {
								await prisma.session.create({
									data: {
										sessionToken,
										userId,
										expires,
										lastActive: new Date(),
										userAgent,
										browser,
										os,
										deviceType,
										ipAddress,
										deviceId,
									},
								});
								// Persist flag so future missing-record checks correctly
								// treat the absence as explicit revocation, not creation failure
								token.sessionRecordedAt = Date.now();
							} catch (err) {
								// Heal failed — will retry on next request
								console.error(
									"[auth] Re-creating a missing session record failed (will retry):",
									err,
								);
							}

							if (dbUser.name) token.name = dbUser.name;
							if (dbUser.image) token.picture = dbUser.image;
							if (dbUser.role) token.role = dbUser.role;
						} else {
							// Session exists — ensure sessionRecordedAt is set
							// (migration path for JWTs issued before this flag existed)
							if (typeof token.sessionRecordedAt !== "number") {
								token.sessionRecordedAt = Date.now();
							}

							// Update lastActive if more than 5 minutes have elapsed since last DB update
							const lastUpdated = (token.lastActiveUpdated as number) || 0;
							const fiveMinutes = 5 * 60 * 1000;
							if (Date.now() - lastUpdated > fiveMinutes) {
								await prisma.session.update({
									where: { id: activeSession.id },
									data: { lastActive: new Date() },
								});
								token.lastActiveUpdated = Date.now();
							}
						}
					} catch (err) {
						// Gracefully handle transient DB errors without kicking out user
						console.error("Session verification notice:", err);
					}
				}

				// Refresh from DB if name or image is missing from token
				if (!token.name || !token.picture) {
					try {
						const dbUser = await prisma.user.findUnique({
							where: { id: userId },
							select: { name: true, image: true, role: true },
						});
						if (dbUser) {
							if (dbUser.name) {
								token.name = dbUser.name;
							}
							if (dbUser.image) {
								token.picture = dbUser.image;
							}
							if (dbUser.role) {
								token.role = dbUser.role;
							}
						}
					} catch (err) {
						// ignore
						console.error(
							"[auth] Refreshing name/image from the database failed:",
							err,
						);
					}
				}
			}
			return token;
		},
		async session({ session, token }) {
			// Display fields only; server-only claims stay in the JWT
			// (see lib/client-session.ts).
			return token ? toClientSession(session, token) : session;
		},
	},
});
