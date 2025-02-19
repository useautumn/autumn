"use client";

import React from "react";
import { AutumnContext } from "./AutumnContext";
import { Toaster } from "react-hot-toast";

export const AutumnProvider = ({
  children,
  publishableKey,
  endpoint = "https://api.useautumn.com",
}: {
  children: React.ReactNode;
  publishableKey: string;
  endpoint?: string;
}) => {
  return (
    <AutumnContext.Provider
      value={{
        publishableKey: publishableKey,
        endpoint: endpoint,
      }}
    >
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 4000,
          style: { fontSize: "14px" },
        }}
      />
      {children}
    </AutumnContext.Provider>
  );
};
