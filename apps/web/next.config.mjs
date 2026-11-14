const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	// Lets a second build or CI run sit beside a running dev server without sharing its output folder.
	distDir: process.env.NEXT_DIST_DIR || ".next",
	async headers() {
		const security = [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "X-Frame-Options", value: "DENY" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{
				key: "Permissions-Policy",
				value:
					"camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
			},
			// Keeps this site in its own process, out of reach of cross-origin attacks.
			{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
			{ key: "Cross-Origin-Resource-Policy", value: "same-origin" },
			{ key: "X-DNS-Prefetch-Control", value: "off" },
		];
		if (isProduction) {
			security.push({
				key: "Strict-Transport-Security",
				value: "max-age=63072000; includeSubDomains; preload",
			});
		}
		return [{ source: "/:path*", headers: security }];
	},
};

export default nextConfig;
