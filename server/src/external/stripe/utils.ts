import { ErrCode } from "@/errors/errCodes.js";
import { decryptData } from "@/utils/encryptUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  BillingInterval,
  Feature,
  FullProduct,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";

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
    case BillingInterval.Quarter:
      return {
        interval: "month",
        interval_count: 3,
      };
    case BillingInterval.SemiAnnual:
      return {
        interval: "month",
        interval_count: 6,
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

export const calculateMetered1Price = ({
  product,
  numEvents,
  metered1Feature,
}: {
  product: any;
  numEvents: number;
  metered1Feature: Feature;
}) => {
  const allowance = product.entitlements.metered1.allowance;
  const usagePrice = product.prices.find(
    (p: any) => p.config.feature_id === metered1Feature.id
  );

  const usageConfig = usagePrice.config as UsagePriceConfig;
  let usage = numEvents - allowance;

  let totalPrice = 0;
  // console.log("Usage: ", usage);

  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    const tier = usageConfig.usage_tiers[i];

    let amtUsed;
    if (tier.to == -1) {
      amtUsed = usage;
    } else {
      amtUsed = Math.min(usage, tier.to);
    }
    const price = tier.amount * (amtUsed / (usageConfig.billing_units ?? 1));
    // console.log("Amount: ", tier.amount, "Used: ", amtUsed, "Price: ", price);
    totalPrice += price;
    usage -= amtUsed;
  }

  return totalPrice;
};
