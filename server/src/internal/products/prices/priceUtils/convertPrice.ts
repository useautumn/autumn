import {
  BillingType,
  EntitlementWithFeature,
  UsageModel,
} from "@autumn/shared";

import { Price } from "@autumn/shared";
import { getBillingType, getPriceEntitlement } from "../priceUtils.js";
import { isFixedPrice } from "./usagePriceUtils.js";

export const priceToFeature = ({
  price,
  ents,
}: {
  price: Price;
  ents: EntitlementWithFeature[];
}) => {
  const ent = getPriceEntitlement(price, ents);
  return ent.feature;
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
