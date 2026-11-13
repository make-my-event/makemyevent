import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
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

// Runs before first paint so the page never flashes the wrong theme.
// The theme follows the system setting; a manual choice is stored and wins.
const themeScript = `(function(){try{var s=localStorage.getItem("makemyevent-theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			className={`${display.variable} ${body.variable}`}
			suppressHydrationWarning
		>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static string, no user input */}
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body>{children}</body>
		</html>
	);
}
