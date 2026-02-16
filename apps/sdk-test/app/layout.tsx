import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Autumn SDK Test",
  description: "Scenario-based integration harness for autumn-js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <AppSidebarLayout>{children}</AppSidebarLayout>
        </Providers>
      </body>
    </html>
  );
}
