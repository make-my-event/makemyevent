import type { Metadata, Viewport } from "next";
import {
	Bricolage_Grotesque,
	IBM_Plex_Mono,
	IBM_Plex_Sans,
} from "next/font/google";
import { headers } from "next/headers";
import { NONCE_HEADER } from "@/lib/csp";
import { SITE_ORIGIN } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme-script.mjs";
import "./globals.css";

// Weights from design-spec.md: display 700; body 400, 500, 700.
const display = Bricolage_Grotesque({
	subsets: ["latin"],
	weight: ["700"],
	variable: "--face-display",
	display: "swap",
});

const body = IBM_Plex_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "700"],
	variable: "--face-body",
	display: "swap",
});

// Only small details use the mono face — ticket codes and IDs — so it must
// not compete for bandwidth with the text that decides first paint.
const mono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["400"],
	variable: "--face-mono",
	display: "swap",
	preload: false,
});

export const metadata: Metadata = {
	// Relative canonical and share-card addresses resolve against this.
	metadataBase: new URL(SITE_ORIGIN),
	title: { default: "MakeMyEvent", template: "%s — MakeMyEvent" },
	description:
		"Free event pages, QR passes and certificates for your community. From the first registration to the last scan at the door.",
	manifest: "/manifest.json",
	icons: {
		icon: [
			{ url: "/icon.svg", type: "image/svg+xml" },
			{ url: "/favicon.ico" },
		],
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
		{ media: "(prefers-color-scheme: dark)", color: "#131211" },
	],
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// A fresh nonce per request, set by the middleware, so this one inline
	// script is allowed while injected scripts are not.
	const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

	return (
		<html
			lang="en"
			className={`${display.variable} ${body.variable} ${mono.variable}`}
			suppressHydrationWarning
		>
			<head>
				{/*
				  Once a nonce-based CSP is active the browser blanks the nonce
				  attribute in the DOM (the value lives only on the element's
				  `nonce` property), so React would report a mismatch against
				  the string the server wrote. The script has already run by
				  then; nothing needs patching, only the warning silenced.
				*/}
				<script
					nonce={nonce}
					suppressHydrationWarning
					// biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string with no user input, carrying the request nonce
					dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
