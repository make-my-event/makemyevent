const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	// Workspace packages ship TypeScript source; Next compiles them with the app.
	transpilePackages: ["@makemyevent/core", "@makemyevent/db"],
	// Lets a second build or CI run sit beside a running dev server without sharing its output folder.
	distDir: process.env.NEXT_DIST_DIR || ".next",
	// The Organized list moved from /dashboard/organized to /dashboard. Old
	// links and bookmarks still arrive: a permanent redirect, query and all,
	// before the middleware and the render. "organized" stays a reserved
	// event address (events_slug_not_reserved) because this redirect owns it.
	async redirects() {
		return [
			{
				source: "/dashboard/organized",
				destination: "/dashboard",
				permanent: true,
			},
		];
	},
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
		// public/ is served with no caching by default, so these stable paths
		// are revalidated on every navigation. They are brand artwork and the
		// manifest: they change rarely, and a stale one for a day is harmless.
		// Anything the build fingerprints is served from /_next/static, which
		// is already immutable for a year.
		const publicAssets = [
			{
				key: "Cache-Control",
				value: "public, max-age=86400, stale-while-revalidate=604800",
			},
		];
		// A guest's ticket page: its address is the ticket. Never passed on to
		// another site, never kept by a cache, never in a search index.
		const ticketPage = [
			{ key: "Referrer-Policy", value: "no-referrer" },
			{ key: "Cache-Control", value: "private, no-store" },
			{ key: "X-Robots-Tag", value: "noindex, nofollow" },
		];
		return [
			{ source: "/:path*", headers: security },
			{ source: "/t/:token", headers: ticketPage },
			{
				source: "/:file(icon\\.svg|favicon\\.ico|manifest\\.json)",
				headers: publicAssets,
			},
			{
				source: "/:file(makemyevent-symbol-[^/]+)",
				headers: publicAssets,
			},
		];
	},
};

export default nextConfig;
