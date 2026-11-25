import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { limited } from "@/lib/rate-limit";
import { NEXT_COOKIE, safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const ALLOWED: readonly EmailOtpType[] = ["email", "magiclink", "signup"];

/**
 * Email links land here once the Supabase email template points at
 * /auth/confirm?token_hash=…&type=email. Unlike the default link, this one
 * works even when the email is opened on a different device or browser.
 */
export async function GET(request: NextRequest) {
	const params = request.nextUrl.searchParams;
	const tokenHash = params.get("token_hash");
	const type = params.get("type") as EmailOtpType | null;

	const fail = () => {
		const response = NextResponse.redirect(
			new URL("/signin?error=link_invalid", request.url),
			303,
		);
		response.cookies.delete(NEXT_COOKIE);
		return response;
	};

	if (!tokenHash || !type || !ALLOWED.includes(type)) return fail();

	// The link is not used up: it still works after the wait, and so does
	// where it was going.
	const slow = await limited("signin.finish", {});
	if (slow)
		return NextResponse.redirect(new URL("/signin?error=busy", request.url), {
			status: 303,
			headers: { "Retry-After": String(slow.retryAfter) },
		});

	const supabase = await createClient();
	const { error } = await supabase.auth.verifyOtp({
		token_hash: tokenHash,
		type,
	});
	if (error) return fail();

	let next = safeRedirectPath(null);
	const raw = request.cookies.get(NEXT_COOKIE)?.value;
	if (raw) {
		try {
			next = safeRedirectPath(decodeURIComponent(raw));
		} catch {
			// keep the default
		}
	}

	const response = NextResponse.redirect(new URL(next, request.url), 303);
	response.cookies.delete(NEXT_COOKIE);
	return response;
}
