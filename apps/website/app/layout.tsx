import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { LayoutProps } from "@/lib/types";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	display: "swap",
});

const url = "https://useautumn.com";

export const metadata: Metadata = {
	title: {
		default: "Billing Infrastructure for AI Startups | Autumn",
		template: "%s | Autumn",
	},
	description:
		"Drop-in billing for AI startups. Stop rebuilding usage limits, credits, and subscription logic. Autumn keeps payments, webhooks, and usage in sync.",
	applicationName: "Autumn",
	keywords: [
		"AI billing",
		"usage-based billing",
		"subscription management",
		"AI startups",
		"billing infrastructure",
		"payment integration",
		"usage limits",
		"credit system",
	],
	authors: [{ name: "Autumn" }],
	creator: "Autumn",
	metadataBase: new URL(url),
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
			{ url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
			{ url: "/icon-192.png", sizes: "192x192", type: "image/png" },
		],
		apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
	},
	openGraph: {
		type: "website",
		locale: "en_US",
		url,
		siteName: "Autumn",
		title: "Autumn — Billing Infrastructure for AI Startups",
		description:
			"The drop-in billing layer for AI startups. Stop rebuilding usage limits, credit systems, and subscription logic.",
		images: [
			{
				url: "/images/og-image.png",
				width: 1200,
				height: 630,
				alt: "Autumn — Billing Infrastructure for AI Startups",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Autumn — Billing Infrastructure for AI Startups",
		description:
			"The drop-in billing layer for AI startups. Stop rebuilding usage limits, credit systems, and subscription logic.",
		images: ["/images/og-image.png"],
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
};

export default function RootLayout({ children }: LayoutProps) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={cn(
				geistSans.variable,
				geistMono.variable,
				"h-full max-w-full overflow-x-clip overscroll-x-none bg-black antialiased",
			)}
		>
			<body className="min-h-full max-w-full overflow-x-clip overscroll-x-none flex flex-col">{children}</body>
		</html>
	);
}
