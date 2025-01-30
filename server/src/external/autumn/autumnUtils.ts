import { AppEnv, ErrCode, MinOrg, Organization } from "@autumn/shared";
import { Autumn } from "./autumnCli.js";
import RecaseError from "@/utils/errorUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { SupabaseClient } from "@supabase/supabase-js";

export enum FeatureId {
  Products = "products",
  Features = "features",
}

export const sendFeatureEvent = async ({
  minOrg,
  env,
  incrementBy,
}: {
  minOrg: MinOrg;
  env: AppEnv;
  incrementBy: number;
}) => {
  if (env !== AppEnv.Live) {
    return;
  }

  try {
    const autumn = new Autumn();

    await autumn.sendEvent({
      customerId: minOrg.id,
      eventName: "feature",
      properties: {
        value: incrementBy,
      },
      customer_data: {
        name: minOrg.slug,
      },
    });
  } catch (error: any) {
    console.log("Failed to send feature event", error?.message || error);
  }
};

export const sendProductEvent = async ({
  minOrg,
  env,
  incrementBy,
}: {
  minOrg: MinOrg;
  env: AppEnv;
  incrementBy: number;
}) => {
  if (env !== AppEnv.Live) {
    return;
  }

  try {
    const autumn = new Autumn();

    await autumn.sendEvent({
      customerId: minOrg.id,
      eventName: "product",
      properties: {
        value: incrementBy,
      },
      customer_data: {
        name: minOrg.slug,
      },
    });
  } catch (error: any) {
    console.log("Failed to send product event", error?.message || error);
  }
};

export const isEntitled = async ({
  minOrg,
  env,
  featureId,
}: {
  minOrg: MinOrg;
  env: AppEnv;
  featureId: FeatureId;
}) => {
  if (env !== AppEnv.Live) {
    return true;
  }

  const autumn = new Autumn();

  try {
    const result = await autumn.entitled({
      customerId: minOrg.id,
      featureId: featureId,
      customer_data: {
        name: minOrg.slug,
      },
    });

    console.log("Result:", result);

    if (result.allowed) {
      return true;
    }

    throw new RecaseError({
      message: `You've used up your allowance for feature ${featureId}. Please upgrade your plan or contact hey@useautumn.com to get more!`,
      code: ErrCode.InternalError,
      data: result,
    });
  } catch (error: any) {
    throw new RecaseError({
      message: "Failed to check entitlement...",
      code: ErrCode.InternalError,
      data: error,
    });
  }
};
