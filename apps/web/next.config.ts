import type { NextConfig } from "next";

/**
 * Security headers on every response (docs/security.md, "Cross-origin &
 * transport"). The Content-Security-Policy is set per request in
 * src/proxy.ts, because it carries a fresh nonce.
 */
const securityHeaders = [
	// HTTPS only for two years. Not includeSubDomains/preload: those commit
	// every subdomain to HTTPS and are hard to undo; add them deliberately.
	{ key: "Strict-Transport-Security", value: "max-age=63072000" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	// Never send full URLs (which can contain ticket/reset tokens) to other
	// sites; same-origin requests keep the full referrer.
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	// No framing (clickjacking). A future public embed route must allow
	// framing for that path only, and must be read-only.
	{ key: "X-Frame-Options", value: "DENY" },
	// The check-in scanner needs the camera; nothing needs the rest.
	{
		key: "Permissions-Policy",
		value:
			"camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
	},
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.supabase.co",
				pathname: "/storage/v1/object/public/**",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
		],
	},
	async headers() {
		return [{ source: "/:path*", headers: securityHeaders }];
	},
};

export default nextConfig;
