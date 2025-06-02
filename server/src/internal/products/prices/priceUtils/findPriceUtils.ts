import {
  BillingType,
  Price,
  PriceType,
  UsagePriceConfig,
} from "@autumn/shared";

import { Feature } from "@autumn/shared";
import { getBillingType } from "../priceUtils.js";
import Stripe from "stripe";

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
