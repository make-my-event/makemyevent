import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A QR pass: a signed token, never a raw id (CLAUDE.md). It says which
 * registration at which event, under which of the event's key versions,
 * and a MAC proves the server issued it. Copying a guest's ticket code is
 * not enough to forge one.
 *
 *   M1.<base64url: version (1 byte) · event id (16) · registration id (16) · MAC (16)>
 *
 * Each event's key is HMAC(master, "pass:" + event + ":" + version), so
 * raising one event's version retires its passes and no other's, and the
 * master key never signs a pass itself. 66 characters after "M1.": small
 * enough for a QR code a phone camera reads from across a desk.
 *
 * Pure: the master key is passed in, so it can be tested without one.
 */

export type PassClaims = {
	eventId: string;
	registrationId: string;
	version: number;
};

const PREFIX = "M1.";
const MAC_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidBytes(id: string): Buffer {
	if (!UUID.test(id)) throw new Error("Not a uuid");
	return Buffer.from(id.replace(/-/g, ""), "hex");
}

function uuidText(bytes: Buffer): string {
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function eventKey(master: Buffer, eventId: string, version: number): Buffer {
	return createHmac("sha256", master)
		.update(`pass:${eventId.toLowerCase()}:${version}`)
		.digest();
}

function mac(
	master: Buffer,
	eventId: string,
	version: number,
	body: Buffer,
): Buffer {
	return createHmac("sha256", eventKey(master, eventId, version))
		.update(body)
		.digest()
		.subarray(0, MAC_BYTES);
}

export function signPass(master: Buffer, claims: PassClaims): string {
	if (
		!Number.isInteger(claims.version) ||
		claims.version < 1 ||
		claims.version > 255
	)
		throw new Error("Key version out of range");
	const body = Buffer.concat([
		Buffer.from([claims.version]),
		uuidBytes(claims.eventId),
		uuidBytes(claims.registrationId),
	]);
	const tag = mac(master, claims.eventId, claims.version, body);
	return PREFIX + Buffer.concat([body, tag]).toString("base64url");
}

/** The claims, if the server issued this token; null for anything else. */
export function readPass(master: Buffer, token: string): PassClaims | null {
	if (
		typeof token !== "string" ||
		!token.startsWith(PREFIX) ||
		token.length > 100
	)
		return null;
	const raw = Buffer.from(token.slice(PREFIX.length), "base64url");
	if (raw.length !== 1 + 16 + 16 + MAC_BYTES) return null;
	const body = raw.subarray(0, 33);
	const tag = raw.subarray(33);
	const version = body[0] ?? 0;
	if (version < 1) return null;
	const eventId = uuidText(body.subarray(1, 17));
	const expected = mac(master, eventId, version, body);
	if (!timingSafeEqual(tag, expected)) return null;
	return { eventId, registrationId: uuidText(body.subarray(17, 33)), version };
}

/**
 * The master key from the environment: 32 or more random bytes, base64.
 * Null when it isn't set, so a page can say passes aren't set up instead
 * of failing.
 */
export function masterKey(): Buffer | null {
	const text = process.env.TICKET_SIGNING_KEY;
	if (!text) return null;
	const key = Buffer.from(text, "base64");
	return key.length >= 32 ? key : null;
}
