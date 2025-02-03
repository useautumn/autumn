"use client";

import React from "react";
import { AutumnContext } from "./AutumnContext";

export const AutumnProvider = ({
  children,
  publishableKey,
}: {
  children: React.ReactNode;
  publishableKey: string;
}) => {
  return (
    <AutumnContext.Provider
      value={{
        publishableKey: publishableKey,
      }}
    >
      {children}
    </AutumnContext.Provider>
  );
};
