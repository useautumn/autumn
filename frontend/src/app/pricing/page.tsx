import { getOrgFromSession } from "@/utils/serverUtils";
import { AutumnProvider, PricingPage } from "@useautumn/react";

export default async function Page() {
  const org = await getOrgFromSession();

  return (
    <AutumnProvider
      publishableKey={process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY || ""}
    >
      <div className="w-full h-full justify-center items-center flex">
        <PricingPage
          customerId={org?.id}
          classNames={
            {
              // container: "flex gap-2 !border-yellow-500",
              // card: "border-yellow-500 !bg-green-300",
              // entitlementsList: "",
            }
          }
        />
      </div>
    </AutumnProvider>
  );
}
