import type { UserRole } from "db";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

/**
 * Builds the session object Auth.js returns to the browser
 * (`useSession()`, `/api/auth/session`) from the signed JWT.
 *
 * Only display fields are copied: id, name, image and role. Server-only
 * claims (`sessionToken`, the revocation key, and `authTime`) must never be
 * added here; the server reads them from the JWT itself
 * (lib/session-claims.ts). docs/security.md: never put a session token
 * where JavaScript can read it.
 */
export function toClientSession(session: Session, token: JWT): Session {
	if (!session.user) return session;
	const userId = (token.id || token.sub) as string | undefined;
	if (userId) session.user.id = userId;
	if (typeof token.name === "string") session.user.name = token.name;
	if (typeof token.picture === "string") session.user.image = token.picture;
	if (typeof token.role === "string")
		session.user.role = token.role as UserRole;
	return session;
}
