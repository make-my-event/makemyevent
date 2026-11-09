import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "db";

/**
 * Single-use account tokens (email verification, password reset), stored in
 * the VerificationToken table.
 *
 * - The raw token only ever appears in the emailed link. The table stores its
 *   SHA-256 hash, so a database leak does not expose usable links.
 * - `identifier` is "<kind>:<email>", so a token of one kind can never be used
 *   for the other.
 * - Issuing a token deletes earlier tokens of the same kind for that email:
 *   only the most recent link works.
 * - Consuming is an atomic delete, so a link works exactly once.
 */

export type AccountTokenKind = "verify-email" | "reset-password";

const TTL_MS: Record<AccountTokenKind, number> = {
	"verify-email": 24 * 60 * 60 * 1000,
	"reset-password": 60 * 60 * 1000,
};

const identifierFor = (kind: AccountTokenKind, email: string) =>
	`${kind}:${email.trim().toLowerCase()}`;

const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

/** Issues a token and returns the raw value for the emailed link. */
export async function issueAccountToken(
	client: PrismaClient,
	kind: AccountTokenKind,
	email: string,
): Promise<string> {
	const identifier = identifierFor(kind, email);
	const token = randomBytes(32).toString("base64url");
	await client.$transaction([
		client.verificationToken.deleteMany({ where: { identifier } }),
		client.verificationToken.create({
			data: {
				identifier,
				token: hashToken(token),
				expires: new Date(Date.now() + TTL_MS[kind]),
			},
		}),
	]);
	return token;
}

/**
 * The email a valid, unexpired token of `kind` belongs to, without using it
 * up. Returns null for unknown, expired or wrong-kind tokens.
 */
export async function peekAccountToken(
	client: PrismaClient,
	kind: AccountTokenKind,
	token: string,
): Promise<string | null> {
	const row = await client.verificationToken.findUnique({
		where: { token: hashToken(token) },
		select: { identifier: true, expires: true },
	});
	const prefix = `${kind}:`;
	if (!row?.identifier.startsWith(prefix) || row.expires <= new Date()) {
		return null;
	}
	return row.identifier.slice(prefix.length);
}

/**
 * Uses up a token. Returns its email, or null if it was not valid or another
 * request used it first.
 */
export async function consumeAccountToken(
	client: PrismaClient,
	kind: AccountTokenKind,
	token: string,
): Promise<string | null> {
	const email = await peekAccountToken(client, kind, token);
	if (!email) return null;
	const deleted = await client.verificationToken.deleteMany({
		where: {
			token: hashToken(token),
			identifier: identifierFor(kind, email),
			expires: { gt: new Date() },
		},
	});
	return deleted.count === 1 ? email : null;
}

/** Removes every outstanding token of `kind` for an email. */
export async function revokeAccountTokens(
	client: PrismaClient,
	kind: AccountTokenKind,
	email: string,
): Promise<void> {
	await client.verificationToken.deleteMany({
		where: { identifier: identifierFor(kind, email) },
	});
}
