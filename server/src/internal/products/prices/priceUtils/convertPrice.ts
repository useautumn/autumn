import {
  BillingType,
  EntitlementWithFeature,
  Feature,
  UsageModel,
  UsagePriceConfig,
} from "@autumn/shared";

import { Price } from "@autumn/shared";
import { getBillingType, getPriceEntitlement } from "../priceUtils.js";
import { isFixedPrice } from "./usagePriceUtils/classifyUsagePrice.js";

export const priceToFeature = ({
  price,
  ents,
  features,
}: {
  price: Price;
  ents?: EntitlementWithFeature[];
  features?: Feature[];
}) => {
  if (!features && !ents) {
    throw new Error("priceToFeature requires either ents or features as arg");
  }

  if (features) {
    return features.find(
      (f) =>
        f.internal_id == (price.config as UsagePriceConfig).internal_feature_id,
    );
  }

  const ent = getPriceEntitlement(price, ents!);
  return ent?.feature;
};

export const priceToUsageModel = (price: Price) => {
  let billingType = getBillingType(price.config);
  if (isFixedPrice({ price })) {
    return undefined;
  }
  if (billingType == BillingType.UsageInAdvance) {
    return UsageModel.Prepaid;
  }
  return UsageModel.PayPerUse;
};
