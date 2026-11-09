import { describe, expect, it } from "vitest";
import {
	generateTicketCode,
	hashTicketAccessToken,
	isSerializationFailure,
	isUniqueViolation,
	issueTicketAccessToken,
} from "./tickets";

describe("ticket codes and link tokens", () => {
	it("generates codes from the unambiguous alphabet", () => {
		for (let i = 0; i < 200; i++) {
			expect(generateTicketCode()).toMatch(
				/^OPT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/,
			);
		}
	});

	it("issues 256-bit link tokens and stores only their hash", () => {
		const { token, tokenHash } = issueTicketAccessToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(tokenHash).toBe(hashTicketAccessToken(token));
		expect(tokenHash).not.toContain(token);
		expect(issueTicketAccessToken().token).not.toBe(token);
	});
});

describe("database error classification", () => {
	// The shape observed from Prisma 7 + @prisma/adapter-pg on a Postgres
	// serialization failure.
	const adapterConflict = {
		code: "P2010",
		meta: {
			driverAdapterError: {
				message: "TransactionWriteConflict",
				cause: {
					kind: "TransactionWriteConflict",
					originalCode: "40001",
					originalMessage:
						"could not serialize access due to concurrent update",
				},
			},
		},
	};

	it.each([
		["Prisma P2034", { code: "P2034" }],
		["P2010 with a driver adapter conflict", adapterConflict],
		["bare driver adapter error", adapterConflict.meta.driverAdapterError],
		["wrapped in a cause", { message: "boom", cause: adapterConflict }],
		["deadlock", { cause: { kind: "Unknown", originalCode: "40P01" } }],
	])("retries a serialization failure: %s", (_name, error) => {
		expect(isSerializationFailure(error)).toBe(true);
	});

	it.each([
		["Prisma P2002", { code: "P2002" }],
		["adapter unique violation", { cause: { originalCode: "23505" } }],
	])("recognises a unique violation: %s", (_name, error) => {
		expect(isUniqueViolation(error)).toBe(true);
	});

	it("does not retry unrelated errors", () => {
		expect(isSerializationFailure(new Error("network down"))).toBe(false);
		expect(isSerializationFailure({ code: "P2025" })).toBe(false);
		expect(isUniqueViolation({ code: "P2034" })).toBe(false);
		expect(isSerializationFailure(null)).toBe(false);
	});
});
