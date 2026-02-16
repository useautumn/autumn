"use client";

import { AutumnProvider } from "autumn-js/react";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <AutumnProvider backendUrl="" pathPrefix="/api/autumn">
      {children}
    </AutumnProvider>
  );
};
