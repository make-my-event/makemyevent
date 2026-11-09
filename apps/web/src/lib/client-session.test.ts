import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";
import { toClientSession } from "./client-session";

describe("toClientSession", () => {
	it("copies display fields and never server-only claims", () => {
		const session = {
			user: { name: null, email: "a@example.com", image: null },
			expires: "2099-01-01T00:00:00.000Z",
		} as unknown as Session;

		const result = toClientSession(session, {
			sub: "user-1",
			name: "Ada",
			picture: "https://img.example/a.png",
			role: "USER",
			sessionToken: "secret-session-key",
			authTime: 1_700_000_000_000,
			sessionRecordedAt: 1_700_000_000_000,
		});

		expect(result.user).toMatchObject({
			id: "user-1",
			name: "Ada",
			image: "https://img.example/a.png",
			role: "USER",
		});
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain("secret-session-key");
		expect(serialized).not.toContain("sessionToken");
		expect(serialized).not.toContain("authTime");
		expect(serialized).not.toContain("sessionRecordedAt");
	});
});
