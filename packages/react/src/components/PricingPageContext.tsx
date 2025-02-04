"use client";
import React from "react";

export interface PricingPageContextType {
  customerId: string;
}

export const PricingPageContext = React.createContext<any>(null);

export const usePricingPageContext = () => {
  return React.useContext(PricingPageContext);
};
