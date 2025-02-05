import { Badge } from "@/components/ui/badge";
import { getOrgFromSession } from "@/utils/serverUtils";
import { AutumnProvider, PricingPage } from "@useautumn/react";
import Image from "next/image";

export default async function Page() {
  const org = await getOrgFromSession();

  return (
    <AutumnProvider
      publishableKey={process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY || ""}
    >
      <div>
        <h1 className="text-xl font-medium">Pricing</h1>
        <p className="text-sm text-t2">
          A free billing engine for early startups that scales with you.{" "}
          <span className="text-t3">
            And yes, this page is powered by Autumn.
          </span>
        </p>
      </div>
      <div className="w-full h-full justify-center items-center flex flex-col gap-4">
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
        <div className="w-full flex justify-end">
          <Badge className="bg-gradient-to-br from-white to-stone-200 text-t3 font-medium border-1.5 border-stone-300 shadow-sm">
            Powered by
            <Image
              src={"/autumn-logo.png"}
              alt="Autumn Logo"
              width={16}
              height={16}
              className=""
            />
            <span className="text-primary/70">Autumn</span>
          </Badge>
        </div>
      </div>
    </AutumnProvider>
  );
}
