import {
  FrontendProductItem,
  Infinite,
  ProductItem,
  ProductItemInterval,
} from "@autumn/shared";

export const defaultFeatureItem: ProductItem = {
  feature_id: null,

  included_usage: null,

  interval: ProductItemInterval.Month,
  interval_count: 1,

  // Price config
  price: null,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
};

export const defaultPriceItem: ProductItem = {
  feature_id: null,
  included_usage: null,

  interval: ProductItemInterval.Month,
  interval_count: 1,

  // Price config
  price: 0,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
};

export const defaultPaidFeatureItem: FrontendProductItem = {
  feature_id: null,
  included_usage: null,
  interval: ProductItemInterval.Month,
  interval_count: 1,

  // Price config
  price: null,
  tiers: [
    {
      amount: 0,
      to: Infinite,
    },
  ],
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
  isPrice: true,
  isVariable: true,
  usage_model: null,
};

export const emptyPriceItem: FrontendProductItem = {
  feature_id: null,
  included_usage: null,

  interval: ProductItemInterval.Month,
  interval_count: 1,

  // Price config
  price: 0,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
  usage_model: null,

  isPrice: true,
  isVariable: null,
};
