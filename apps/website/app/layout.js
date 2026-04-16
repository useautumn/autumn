import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "Autumn — Billing Infrastructure for AI Startups",
    template: "%s | Autumn",
  },
  description:
    "The drop-in billing layer for AI startups. Stop rebuilding usage limits, credit systems, and subscription logic. Autumn keeps webhooks, payments, and usage perfectly in-sync.",
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
  metadataBase: new URL("https://autumndev.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://autumndev.vercel.app",
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

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-black`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
