import { bindGuestCheckinToken } from "@/../../api/src/services/tickets";
import { createContext } from "@/../../api/src/trpc/trpc";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const COOKIE_NAME = "op-guest-rsvp";
// 90 days — persistent cookie for guest RSVP authorization
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

const bodySchema = z.object({
	// Token from the ticket link, returned to the booking (or claiming) browser.
	accessToken: z.string().min(40).max(64),
});

/**
 * POST /api/guest-rsvp-init
 *
 * Called by the browser that just booked or claimed a ticket, so it can take
 * part in QR chain check-in without an account.
 *
 * Requires the ticket's link token (proof of holding the ticket). A ticket code
 * is not enough: codes are printed on passes and in email subjects.
 *
 * Security properties:
 * - Only the SHA-256 hash of the cookie value is stored (GuestTicketToken).
 * - HttpOnly prevents client-side JavaScript access.
 * - SameSite=Lax prevents cross-site request forgery.
 * - Secure in production.
 * - Database access stays in apps/api (services/tickets.ts).
 */
export async function POST(req: Request): Promise<NextResponse> {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "A ticket link token is required." },
			{ status: 400 },
		);
	}

	const rawUuid = await bindGuestCheckinToken(
		createContext().prisma,
		parsed.data.accessToken,
	);
	if (!rawUuid) {
		return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
	}

	const response = NextResponse.json({ issued: true });
	response.cookies.set({
		name: COOKIE_NAME,
		value: rawUuid,
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		maxAge: COOKIE_MAX_AGE_SECONDS,
		path: "/",
	});

	try {
		const cookieStore = await cookies();
		cookieStore.set(COOKIE_NAME, rawUuid, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			maxAge: COOKIE_MAX_AGE_SECONDS,
			path: "/",
		});
	} catch {
		// safe ignore if cookies() is readonly in some contexts
	}

	return response;
}
