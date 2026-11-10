import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import type { JSX, ReactNode } from "react";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";
import { Providers } from "./providers";

// Variable font so the width axis can load (next/font only accepts `axes`
// with a variable weight). Covers the 500 and 600 weights the design uses;
// the landing display type sets font-stretch 112% (font-stretch-wide).
const archivo = Archivo({
	subsets: ["latin"],
	weight: "variable",
	axes: ["wdth"],
	variable: "--font-display",
});
const plexSans = IBM_Plex_Sans({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-body",
});
const plexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["500"],
	variable: "--font-mono",
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://makemyevent.org";

export const metadata: Metadata = {
	metadataBase: new URL(baseUrl),
	alternates: {
		canonical: "./",
	},
	title: {
		default: "makemyevent | Find and host community events",
		template: "%s | makemyevent",
	},
	description:
		"makemyevent is an open-source event management and ticketing platform for tech communities, meetups, hackathons, and open-source clubs.",
	keywords: [
		"makemyevent",
		"events",
		"ticketing",
		"conferences",
		"meetups",
		"hackathons",
		"open source",
		"foss united",
		"community events",
		"rsvp platform",
		"event management",
	],
	openGraph: {
		type: "website",
		locale: "en_IN",
		url: baseUrl,
		title: "makemyevent | Find and host community events",
		description:
			"Open-source event ticketing and management platform for running conferences, workshops, fests, and meetups.",
		siteName: "makemyevent",
		images: [
			{
				url: "/makemyevent-symbol-575x630.png",
				width: 575,
				height: 630,
				alt: "makemyevent logo",
			},
		],
	},
	twitter: {
		// The only share image is the square-ish logo, which a large card
		// would crop. Switch back once a 1200x630 banner image exists.
		card: "summary",
		title: "makemyevent | Find and host community events",
		description: "Open-source event ticketing and management platform.",
		images: ["/makemyevent-symbol-575x630.png"],
	},
	verification: {
		google: "EO9SG-z--GhL_8DQ1ywwXUUHJPIIGJiLKhQITqxbdOQ",
	},
	robots: {
		index: true,
		follow: true,
	},
	icons: {
		icon: [
			{ url: "/makemyevent-symbol-467x512.svg", type: "image/svg+xml" },
			{ url: "/favicon.ico", sizes: "any" },
		],
		shortcut: "/favicon.ico",
		apple: [
			{
				url: "/makemyevent-symbol-164x180.png",
				sizes: "180x180",
				type: "image/png",
			},
		],
	},
	manifest: "/manifest.json",
};

// Pinch-zoom must stay enabled (WCAG 1.4.4), so no maximumScale/userScalable.
// theme-color needs literal values; they mirror the `paper` token in
// globals.css (light and dark). Update both together.
export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	colorScheme: "light dark",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
		{ media: "(prefers-color-scheme: dark)", color: "#131211" },
	],
};

export interface RootLayoutProps {
	children: ReactNode;
}

export default async function RootLayout({
	children,
}: RootLayoutProps): Promise<JSX.Element> {
	// The proxy (src/proxy.ts) puts a fresh CSP nonce on every request. Reading
	// it opts every route into dynamic rendering, which nonces require (Next.js
	// can only add them during server rendering).
	const nonce = (await headers()).get("x-nonce") ?? undefined;

	return (
		// suppressHydrationWarning: ThemeScript sets class/data-theme on <html>
		// before React hydrates; only this element's attributes are affected.
		<html lang="en" suppressHydrationWarning>
			<head>
				<ThemeScript nonce={nonce} />
				<link
					rel="icon"
					href="/makemyevent-symbol-467x512.svg"
					type="image/svg+xml"
					sizes="any"
				/>
				<link rel="apple-touch-icon" href="/makemyevent-symbol-164x180.png" />
			</head>
			<body
				className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}
			>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
