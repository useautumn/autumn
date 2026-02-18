"use client";

import { AutumnProvider } from "autumn-js/react";

export default function BetterAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AutumnProvider useBetterAuth>{children}</AutumnProvider>;
}
