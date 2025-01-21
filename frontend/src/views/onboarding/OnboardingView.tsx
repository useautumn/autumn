// "use client";
import React from "react";
import ConnectStripe from "./ConnectStripe";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import CreateOrgView from "./CreateOrgView";
import { OrganizationList, OrganizationSwitcher } from "@clerk/nextjs";

async function OnboardingView() {
  const { sessionClaims }: { sessionClaims: any } = await auth();
  const { org_id, org, user } = sessionClaims || {};

  if (!org_id && Object.keys(user.organizations).length == 0) {
    return <CreateOrgView />;
  } else {
    redirect("/sandbox/customers");
    // window.location.href = "/sandbox/customers";
  }

  // else if (!org_id) {
  //   return (
  //     <div className="flex flex-col items-center justify-center h-screen w-screen bg-zinc-100">
  //       <OrganizationList hidePersonal={true} />
  //     </div>
  //   );
  // }

  // if (!org.stripe_connected) {
  //   return <ConnectStripe />;
  // }

  // redirect("/sandbox/customers");
}

export default OnboardingView;
