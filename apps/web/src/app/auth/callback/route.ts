import { type NextRequest, NextResponse } from "next/server";
import { limited } from "@/lib/rate-limit";
import { afterSignIn } from "@/lib/after-sign-in";
import { NEXT_COOKIE, safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

function readNext(request: NextRequest): string {
	const raw = request.cookies.get(NEXT_COOKIE)?.value;
	if (!raw) return safeRedirectPath(null);
	try {
		return safeRedirectPath(decodeURIComponent(raw));
	} catch {
		return safeRedirectPath(null);
	}
}

function finish(request: NextRequest, path: string) {
	const response = NextResponse.redirect(new URL(path, request.url), 303);
	response.cookies.delete(NEXT_COOKIE);
	return response;
}

/**
 * Google sends people back here, and so does the default email link.
 * Both arrive with a one-time code that is swapped for a session.
 */
export async function GET(request: NextRequest) {
	const params = request.nextUrl.searchParams;
	const code = params.get("code");

	if (params.get("error")) {
		const expired = params.get("error_code") === "otp_expired";
		const cancelled = params.get("error") === "access_denied" && !expired;
		return finish(
			request,
			`/signin?error=${expired ? "link_invalid" : cancelled ? "cancelled" : "failed"}`,
		);
	}

	if (!code) return finish(request, "/signin?error=failed");

	const slow = await limited("signin.finish", {});
	if (slow) {
		const response = finish(request, "/signin?error=busy");
		response.headers.set("Retry-After", String(slow.retryAfter));
		return response;
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.exchangeCodeForSession(code);
	if (error) return finish(request, "/signin?error=link_invalid");

	return finish(request, afterSignIn(readNext(request), data.user));
}
