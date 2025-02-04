"use client";

import { AutumnProvider, PricingPage } from "@useautumn/react";

export default function Page() {
  return (
    <AutumnProvider
      publishableKey={process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY || ""}
    >
      <div className="w-full h-full justify-center items-center flex">
        <PricingPage classNames={{ 
          container: "flex gap-2 !border-yellow-500",
          card: "border-yellow-500 !bg-green-300",
          purchaseButton: "",
          entitlementsList: ""
        }} />
      </div>
    </AutumnProvider>
  );
}
