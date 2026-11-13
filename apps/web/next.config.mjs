/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	// Lets a second build or CI run sit beside a running dev server without sharing its output folder.
	distDir: process.env.NEXT_DIST_DIR || ".next",
	poweredByHeader: false,
	async headers() {
		const security = [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "X-Frame-Options", value: "DENY" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{
				key: "Permissions-Policy",
				value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
			},
		];
		if (process.env.NODE_ENV === "production") {
			security.push({
				key: "Strict-Transport-Security",
				value: "max-age=63072000; includeSubDomains; preload",
			});
		}
		return [{ source: "/:path*", headers: security }];
	},
};

export default nextConfig;
