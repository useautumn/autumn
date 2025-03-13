import {
  AllowanceType,
  BillingInterval,
  BillWhen,
  EntitlementWithFeature,
} from "@autumn/shared";

import { FixedPriceConfig, Price, UsagePriceConfig } from "@autumn/shared";

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
