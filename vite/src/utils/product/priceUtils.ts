import {
  AllowanceType,
  BillingInterval,
  BillWhen,
  EntitlementWithFeature,
  PriceType,
  ProductItem,
  ProductItemInterval,
} from "@autumn/shared";

import { FixedPriceConfig, Price, UsagePriceConfig } from "@autumn/shared";
import { intervalIsNone } from "./productItemUtils";
import { isFeatureItem } from "./getItemType";

export const validBillingInterval = (
  prices: Price[],
  config: FixedPriceConfig | UsagePriceConfig
) => {
  const interval1 = config.interval;
  if (!interval1 || interval1 == BillingInterval.OneOff) {
    return true;
  }

  for (const price of prices) {
    const interval2 = price.config?.interval;

    if (!interval2 || interval2 == BillingInterval.OneOff) {
      continue;
    }

    if (interval1 != interval2) {
      return false;
    }
  }

  return true;
};

export const getBillingUnits = (
  config: UsagePriceConfig,
  entitlements: EntitlementWithFeature[]
) => {
  if (!entitlements) return "(error)";

  if (
    config.bill_when == BillWhen.EndOfPeriod ||
    config.bill_when == BillWhen.StartOfPeriod ||
    config.bill_when == BillWhen.InAdvance
  ) {
    return `${config.billing_units} ` || "n";
  }

  const entitlement = entitlements?.find(
    (e) => e.internal_feature_id == config?.internal_feature_id
  );
  if (!entitlement) return "n";

  if (entitlement.allowance_type == AllowanceType.Unlimited) return "∞";
  if (entitlement.allowance_type == AllowanceType.None) return "n";

  return `${entitlement.allowance} `;
};

export const getDefaultPriceConfig = (type: PriceType) => {
  if (type === PriceType.Fixed) {
    return {
      type: PriceType.Fixed,
      amount: "",
      interval: BillingInterval.Month,
    };
  }

  return {
    type: PriceType.Usage,
    internal_feature_id: "",
    feature_id: "",
    bill_when: BillWhen.EndOfPeriod,
    interval: BillingInterval.Month,
    billing_units: 1,
    usage_tiers: [
      {
        from: 0,
        to: "",
        amount: 0.0,
      },
    ],
    should_prorate: false,
  };
};

export const pricesOnlyOneOff = (items: ProductItem[]) => {
  let prices = items.filter((item) => !isFeatureItem(item));

  if (prices.length == 0) return false;

  return prices.every((price) => {
    return intervalIsNone(price.interval);
  });
  // if (items.length == 0) return false;
  // return items.every((item) => {
  //   return item.interval == ProductItemInterval.None;
  // });
};
