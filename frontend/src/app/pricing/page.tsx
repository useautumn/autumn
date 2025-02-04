"use client";

import { AutumnProvider, PricingPage } from "@useautumn/react";

export default function Page() {
  return (
    <AutumnProvider
      publishableKey={process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY || ""}
    >
      <div className="w-full h-full justify-center items-center flex">
        <PricingPage className="rounded-full bg-fuchsia-500" />
      </div>
    </AutumnProvider>
  );
}
