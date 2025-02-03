"use client";

import React from "react";
import { AutumnProvider as AProvider } from "@useautumn/react";

export const AutumnProvider = ({ children }) => {
  return <AProvider>{children}</AProvider>;
};
