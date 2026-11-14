import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import { NONCE_HEADER } from "@/lib/csp";
import { THEME_SCRIPT } from "@/lib/theme-script.mjs";
import "./globals.css";

// Weights from design-spec.md section 3: display 700; body 400, 500, 700.
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

export const metadata: Metadata = {
	title: { default: "makemyevent", template: "%s — makemyevent" },
	description: "Tickets, passes and check-in for community events.",
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
			className={`${display.variable} ${body.variable}`}
			suppressHydrationWarning
		>
			<head>
				<script
					nonce={nonce}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string with no user input, carrying the request nonce
					dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
