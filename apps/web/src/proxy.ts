import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
	buildContentSecurityPolicy,
	createNonce,
} from "@/lib/content-security-policy";

const CSP_HEADER = "Content-Security-Policy-Report-Only";

export const proxy = auth((req) => {
	const nonce = createNonce();
	const csp = buildContentSecurityPolicy({
		nonce,
		isDev: process.env.NODE_ENV !== "production",
	});

	const isLoggedIn = !!req.auth;
	const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");

	if (isOnboarding && !isLoggedIn) {
		const redirect = NextResponse.redirect(
			new URL("/login", req.nextUrl.origin),
		);
		redirect.headers.set(CSP_HEADER, csp);
		return redirect;
	}

	// Next.js reads the nonce from this request header and applies it to the
	// scripts it renders.
	const requestHeaders = new Headers(req.headers);
	requestHeaders.set("x-nonce", nonce);
	requestHeaders.set(CSP_HEADER.toLowerCase(), csp);

	const response = NextResponse.next({ request: { headers: requestHeaders } });
	response.headers.set(CSP_HEADER, csp);
	response.headers.set("Reporting-Endpoints", 'csp="/api/csp-report"');
	return response;
});

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
