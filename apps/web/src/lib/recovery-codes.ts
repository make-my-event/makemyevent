import { createHash, randomBytes } from "node:crypto";

/** Recovery codes: making them, and reading what someone types. */

export const RECOVERY_CODE_COUNT = 10;

/** Crockford's base 32: no I, L, O or U, so nothing reads as something else. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 80 random bits: XXXX-XXXX-XXXX-XXXX. */
function newRecoveryCode(): string {
	let bits = 0n;
	for (const byte of randomBytes(10)) bits = (bits << 8n) | BigInt(byte);
	let text = "";
	for (let i = 0; i < 16; i++) {
		text = ALPHABET[Number(bits & 31n)] + text;
		bits >>= 5n;
	}
	return (text.match(/.{4}/g) ?? []).join("-");
}

export function newRecoveryCodes(): string[] {
	return Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
}

/**
 * A typed code in its one form, or null: any case, any spacing, and the
 * letters people mistake for digits read as those digits.
 */
export function readRecoveryCode(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 64) return null;
	const text = value
		.toUpperCase()
		.replace(/[\s-]/g, "")
		.replace(/[IL]/g, "1")
		.replace(/O/g, "0");
	return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(text) ? text : null;
}

/** What the database is given in place of a code; it salts and hashes again. */
export function recoveryDigest(code: string): string {
	return createHash("sha256").update(code.replaceAll("-", "")).digest("hex");
}
