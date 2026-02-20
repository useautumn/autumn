"use client";

import { AutumnProvider } from "autumn-js/react";

export default function CoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AutumnProvider>
      {children}
    </AutumnProvider>
  );
}
