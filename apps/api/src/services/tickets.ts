import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { PrismaClient } from "db";
import { verifiedEmail } from "./invites";

/**
 * Ticket access rules.
 *
 * A ticket's holder proves ownership with the secret token in their ticket
 * link (/tickets/<token>), emailed at booking, transfer, waitlist promotion or
 * on request. Only its SHA-256 hash is stored. The human-readable ticket code
 * (OPT-XXXX-YYYY) is printed on passes and in email subjects, so it is treated
 * as public: on its own it shows only a minimal card.
 *
 * Full access (QR token, attendee details, drop, transfer) is granted to:
 * - whoever presents the ticket's link token,
 * - the signed-in account the ticket belongs to (userId), or whose verified
 *   email is the attendee email,
 * - the event organizer's owner.
 */

/** Unambiguous alphabet (no 0/O, 1/I/L) for codes read aloud at check-in desks. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCodeBlock(length: number): string {
	let out = "";
	for (let i = 0; i < length; i++) {
		out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	}
	return out;
}

/** OPT-XXXX-YYYY from a CSPRNG. Callers retry on a unique-constraint clash. */
export function generateTicketCode(): string {
	return `OPT-${randomCodeBlock(4)}-${randomCodeBlock(4)}`;
}

/** QR payload scanned at check-in. */
export function generateQrToken(): string {
	return `qrv1_${randomUUID().replace(/-/g, "")}`;
}

export interface TicketAccessToken {
	/** Raw token: only ever placed in the holder's link. Never stored or logged. */
	token: string;
	tokenHash: string;
}

export function hashTicketAccessToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function issueTicketAccessToken(): TicketAccessToken {
	const token = randomBytes(32).toString("base64url");
	return { token, tokenHash: hashTicketAccessToken(token) };
}

export interface TicketOwnershipFacts {
	userId: string | null;
	attendeeEmail: string;
	accessTokenHash: string | null;
	organizerOwnerId: string;
}

/**
 * Whether the caller may see and act on the full ticket. `accessToken` is the
 * token from the ticket link, if the caller presented one.
 */
export async function hasFullTicketAccess(
	client: PrismaClient,
	ticket: TicketOwnershipFacts,
	caller: { userId: string | null; accessToken?: string | null },
): Promise<boolean> {
	if (
		caller.accessToken &&
		ticket.accessTokenHash !== null &&
		hashTicketAccessToken(caller.accessToken) === ticket.accessTokenHash
	) {
		return true;
	}
	if (!caller.userId) return false;
	if (ticket.userId === caller.userId) return true;
	if (ticket.organizerOwnerId === caller.userId) return true;
	const email = await verifiedEmail(client, caller.userId);
	return email !== null && email === ticket.attendeeEmail.toLowerCase();
}

/**
 * Prisma reports database errors in different shapes depending on the call
 * (known request error P2002/P2034, P2010 for raw queries, or a bare driver
 * adapter error from the Postgres adapter). Walk the error, its `cause` and
 * `meta.driverAdapterError` and match on the Postgres-level signal.
 */
function matchesDbError(
	error: unknown,
	prismaCodes: readonly string[],
	kinds: readonly string[],
	sqlStates: readonly string[],
): boolean {
	const queue: unknown[] = [error];
	const seen = new Set<unknown>();
	while (queue.length > 0) {
		const current = queue.shift();
		if (current === null || typeof current !== "object" || seen.has(current)) {
			continue;
		}
		seen.add(current);
		const record = current as Record<string, unknown>;
		if (
			(typeof record.code === "string" && prismaCodes.includes(record.code)) ||
			(typeof record.kind === "string" && kinds.includes(record.kind)) ||
			(typeof record.originalCode === "string" &&
				sqlStates.includes(record.originalCode)) ||
			(typeof record.message === "string" && kinds.includes(record.message))
		) {
			return true;
		}
		const meta = record.meta as Record<string, unknown> | undefined;
		queue.push(record.cause, meta?.driverAdapterError);
	}
	return false;
}

/** Unique-constraint violation (e.g. a ticket-code collision). */
export function isUniqueViolation(error: unknown): boolean {
	return matchesDbError(
		error,
		["P2002"],
		["UniqueConstraintViolation"],
		["23505"],
	);
}

/**
 * Serialization failure or deadlock: the transaction lost a race and is safe
 * to retry from the start.
 */
export function isSerializationFailure(error: unknown): boolean {
	return matchesDbError(
		error,
		["P2034"],
		["TransactionWriteConflict"],
		["40001", "40P01"],
	);
}

/**
 * Binds the guest check-in cookie to a ticket, for a browser that holds the
 * ticket's link token. Returns the raw cookie value; only its hash is stored.
 * Replacing an existing guest binding requires the same proof (the link
 * token), so knowing a ticket code is not enough to take it over.
 */
export async function bindGuestCheckinToken(
	client: PrismaClient,
	accessToken: string,
): Promise<string | null> {
	const ticket = await client.issuedTicket.findUnique({
		where: { accessTokenHash: hashTicketAccessToken(accessToken) },
		select: { id: true },
	});
	if (!ticket) return null;

	const rawCookie = randomUUID();
	const tokenHash = createHash("sha256").update(rawCookie).digest("hex");
	await client.guestTicketToken.upsert({
		where: { issuedTicketId: ticket.id },
		update: { tokenHash },
		create: { tokenHash, issuedTicketId: ticket.id },
	});
	return rawCookie;
}
