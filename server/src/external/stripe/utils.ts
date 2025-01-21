import { ErrCode } from "@/errors/errCodes.js";
import { decryptData } from "@/utils/encryptUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { BillingInterval, Organization } from "@autumn/shared";

import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";

export const createStripeCli = ({
  org,
  env,
}: {
  org: Organization;
  env: AppEnv;
}) => {
  if (!org.stripe_config) {
    throw new RecaseError({
      message: "Stripe config not found",
      code: ErrCode.StripeConfigNotFound,
    });
  }
  let encrypted =
    env == AppEnv.Sandbox
      ? org.stripe_config.test_api_key
      : org.stripe_config.live_api_key;

  let decrypted = decryptData(encrypted);

  return new Stripe(decrypted);
};

export const billingIntervalToStripe = (interval: BillingInterval) => {
  switch (interval) {
    case BillingInterval.Month:
      return {
        interval: "month",
        interval_count: 1,
      };
    case BillingInterval.Year:
      return {
        interval: "year",
        interval_count: 1,
      };
    default:
      break;
  }
};
