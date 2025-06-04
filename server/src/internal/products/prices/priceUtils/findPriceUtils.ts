import {
  BillingType,
  ErrCode,
  Price,
  PriceType,
  UsagePriceConfig,
} from "@autumn/shared";

import { Feature } from "@autumn/shared";
import { getBillingType } from "../priceUtils.js";
import Stripe from "stripe";
import RecaseError from "@/utils/errorUtils.js";

export const findPrepaidPrice = ({
  prices,
  internalFeatureId,
}: {
  prices: Price[];
  internalFeatureId?: string;
}) => {
  return prices.find((p: Price) => {
    if (p.config.type != PriceType.Usage) return false;

    const billingType = getBillingType(p.config);
    const config = p.config as UsagePriceConfig;

    if (billingType != BillingType.UsageInAdvance) return false;

    if (internalFeatureId) {
      return config.internal_feature_id == internalFeatureId;
    } else return true;
  });
};

export const findPriceForFeature = ({
  prices,
  feature,
  internalFeatureId,
}: {
  prices: Price[];
  feature?: Feature;
  internalFeatureId?: string;
}) => {
  if (!feature && !internalFeatureId) {
    throw new RecaseError({
      message: "findPriceForFeature: No feature or internalFeatureId provided",
      code: ErrCode.InternalError,
    });
  }

  return prices.find((p: Price) => {
    const config = p.config as UsagePriceConfig;

    if (!config.internal_feature_id) {
      return false;
    }

    if (internalFeatureId) {
      return config.internal_feature_id == internalFeatureId;
    } else {
      return config.internal_feature_id == feature!.internal_id;
    }
  });
};

export const findPriceFromPlaceholderId = ({
  prices,
  placeholderId,
}: {
  prices: Price[];
  placeholderId: string;
}) => {
  return prices.find((p: Price) => {
    const config = p.config as UsagePriceConfig;
    return config.stripe_placeholder_price_id == placeholderId;
  });
};

export const findPriceFromStripeId = ({
  prices,
  stripePriceId,
  billingType,
}: {
  prices: Price[];
  stripePriceId: string;
  billingType?: BillingType;
}) => {
  return prices.find((p: Price) => {
    const config = p.config as UsagePriceConfig;
    const idMatch = config.stripe_price_id == stripePriceId;
    const typeMatch = billingType
      ? getBillingType(config) == billingType
      : true;

    return idMatch && typeMatch;
  });
};
