import { createHash } from "node:crypto";
import { appRouter } from "@/../../api/src/trpc/app.router";
import { clientIpFromHeaders } from "@/../../api/src/lib/client-ip";
import { createContext } from "@/../../api/src/trpc/trpc";
import { auth } from "@/lib/auth";
import { readSessionClaims } from "@/lib/session-claims";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies } from "next/headers";

const GUEST_COOKIE_NAME = "op-guest-rsvp";

const handler = async (req: Request) => {
	// auth() runs the jwt callback, including the revocation check.
	const session = await auth();
	const claims = session?.user?.id
		? await readSessionClaims(req)
		: { sessionToken: null, authTime: null };
	// Fail closed: a signed-in user must have a session record key, so every
	// authenticated call can be checked against revocation (authedProcedure).
	const userId =
		session?.user?.id && claims.sessionToken ? session.user.id : null;
	if (session?.user?.id && !claims.sessionToken) {
		console.error(
			"[auth] Signed-in request without a session key; treated as signed out.",
		);
	}

	// Derive the guest token hash from the HttpOnly cookie so the API layer
	// can validate it without ever seeing the raw UUID.
	let rawUuid: string | null = null;
	try {
		const cookieStore = await cookies();
		rawUuid = cookieStore.get(GUEST_COOKIE_NAME)?.value ?? null;
	} catch (err) {
		// cookies() is unavailable in some environments; fall back to the header.
		console.error(
			"[trpc] Reading cookies failed, using the Cookie header:",
			err,
		);
	}

	if (!rawUuid) {
		const cookieHeader = req.headers.get("cookie");
		if (cookieHeader) {
			const match = cookieHeader.match(
				new RegExp(`(?:^|;\\s*)${GUEST_COOKIE_NAME}=([^;]*)`),
			);
			if (match) {
				rawUuid = decodeURIComponent(match[1]);
			}
		}
	}

	const guestTokenHash = rawUuid
		? createHash("sha256").update(rawUuid).digest("hex")
		: null;

	return fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: () =>
			createContext(
				userId,
				userId ? claims.sessionToken : null,
				guestTokenHash,
				clientIpFromHeaders(req.headers),
				userId ? claims.authTime : null,
			),
	});
};

export { handler as GET, handler as POST };
