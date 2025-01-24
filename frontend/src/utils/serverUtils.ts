import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Organization } from "@autumn/shared";
export const onboardingComplete = async () => {
  const authData = await auth();
  const clerkCli = await clerkClient();
  if (!authData.orgId) {
    return redirect("/onboarding");
  }

  const org = await clerkCli.organizations.getOrganization({
    organizationId: authData.orgId!,
  });

  const meta = org.privateMetadata as any;
  if (!meta.stripe?.connected) {
    return redirect("/onboarding");
  }

  return org;
};

export const getOrgFromSession = async () => {
  const { sessionClaims }: { sessionClaims: any } = await auth();

  const org: Organization = {
    id: sessionClaims?.org?.id,
    slug: sessionClaims?.org?.slug,
    default_currency: sessionClaims?.org?.default_currency,
    stripe_connected: sessionClaims?.org?.stripe_connected,
  };

  return org;
};
