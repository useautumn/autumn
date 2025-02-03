"use client";
import React from "react";

export interface AutumnContextType {
  publishableKey: string;
}

export const AutumnContext = React.createContext<any>(null);

export const useAutumnContext = () => {
  return React.useContext(AutumnContext);
};
