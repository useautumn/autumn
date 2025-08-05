import { ProductItem, ProductItemInterval } from "@autumn/shared";

export const defaultFeatureItem: ProductItem = {
  feature_id: null,

  included_usage: null,

  interval: ProductItemInterval.Month,

  // Price config
  price: null,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
};

export const defaultPaidFeatureItem: ProductItem = {
  feature_id: null,
  included_usage: null,
  interval: ProductItemInterval.Month,

  // Price config
  price: null,
  tiers: [
    {
      amount: 0,
      to: "inf",
    },
  ],
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
};

export const defaultPriceItem: ProductItem = {
  feature_id: null,
  included_usage: null,

  interval: ProductItemInterval.Month,

  // Price config
  price: 0,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
};
