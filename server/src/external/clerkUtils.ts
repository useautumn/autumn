import { ErrCode } from "@/errors/errCodes.js";
import { decryptData } from "@/utils/encryptUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv } from "@autumn/shared";
import { clerkClient, createClerkClient } from "@clerk/express";

export const createClerkCli = () => {
  return createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });
};

export const getOrgById = async (orgId: string) => {
  const orgRes = await clerkClient.organizations.getOrganization({
    organizationId: orgId,
  });
  return orgRes;
};

export const getStripeKey = async (orgId: string, env: AppEnv) => {
  const orgRes = await getOrgById(orgId);
  let meta: any = orgRes.privateMetadata;

  // let key =
  //   env == AppEnv.Sandbox
  //     ? meta.stripe?.test_api_key
  //     : meta.stripe?.live_api_key;

  // TODO: Change this to conditional
  let key = meta.stripe?.test_api_key;

  if (!key) {
    throw new RecaseError({
      code: ErrCode.StripeKeyNotFound,
      message: "Stripe key not found",
    });
  }

  return decryptData(key);
};

export const createOrgAndAssignUser = async (
  name: string,
  slug: string,
  userId: string
) => {
  try {
    const orgRes = await clerkClient.organizations.createOrganization({
      name,
      slug,
    });

    await clerkClient.organizations.createOrganizationMembership({
      userId,
      role: "org:admin",
      organizationId: orgRes.id,
    });

    return orgRes;
  } catch (error) {
    console.log("Clerk error:", error);
  }
};
