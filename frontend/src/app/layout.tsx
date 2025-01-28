import type { Metadata } from "next";

import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { NextUIProvider } from "@nextui-org/react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

const getTitle = async () => {
  // const headersList = await headers();
  // const origin = headersList.get("origin");

  // if (origin === "https://app.autumn.com") {
  //   return "Autumn";
  // } else {
  //   return "Autumn (Local)";
  // }
  return "Autumn";
};

export const metadata: Metadata = {
  title: await getTitle(),
  description:
    "Handling pricing plans, packaging and entitlements for your customers",
};

import React from "react";

import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { AppEnv } from "@autumn/shared";
import { redirect } from "next/navigation";
import { SidebarProvider } from "../components/ui/sidebar";
import HomeSidebar from "../views/sidebar/Sidebar";
import RefreshHandler from "@/components/general/RefreshHandler";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;
  const path = headersList.get("path") || "";
  const refresh = headersList.get("refresh") === "true";

  const { sessionClaims }: { sessionClaims: any } = await auth();
  const { org_id, org } = sessionClaims || {};

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} font-regular`}
        suppressHydrationWarning
      >
        {/* @ts-expect-error ClerkProvider is not a valid JSX component */}
        <ClerkProvider>
          <NextUIProvider>
            <SidebarProvider>
              {org_id && !path.includes("/demo") && (
                <HomeSidebar
                  user={sessionClaims?.user as any}
                  org={org}
                  path={path}
                  env={env as AppEnv}
                />
              )}
              <main className="flex flex-col w-full h-screen overflow-hidden">
                {env === AppEnv.Sandbox && (
                  <div className="w-full h-5 bg-primary/80 text-white text-xs flex items-center justify-center">
                    <p className="font-medium">SANDBOX</p>
                  </div>
                )}

                {path.includes("/onboarding") ? (
                  children
                ) : (
                  <div className="w-full h-full overflow-scroll bg-stone-50 p-6 flex justify-center">
                    <div className="w-full h-fit max-w-[1048px] flex flex-col gap-4">
                      {children}
                    </div>
                  </div>
                )}
              </main>
            </SidebarProvider>
          </NextUIProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
