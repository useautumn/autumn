import {
  AllowanceType,
  BillWhen,
  EntInterval,
  EntitlementWithFeature,
  FeatureType,
  FixedPriceConfig,
  Infinite,
  Price,
  ProductItem,
  UsageModel,
  ProductItemInterval,
  TierInfinite,
  UsagePriceConfig,
} from "@autumn/shared";

import { nullish } from "@/utils/genUtils.js";
import {
  billingToItemInterval,
  entToItemInterval,
} from "./itemIntervalUtils.js";

export const toProductItem = ({
  ent,
  price,
}: {
  ent?: EntitlementWithFeature;
  price?: Price;
}) => {
  if (nullish(price)) return toFeatureItem({ ent: ent! }) as ProductItem;
  if (nullish(ent)) return toPriceItem({ price: price! }) as ProductItem;

  return toFeaturePriceItem({ ent: ent!, price: price! }) as ProductItem;
};

export const toFeatureItem = ({ ent }: { ent: EntitlementWithFeature }) => {
  if (ent.feature.type == FeatureType.Boolean) {
    return {
      feature_id: ent.feature.id,
      entitlement_id: ent.id,
    };
  }

  return {
    feature_id: ent.feature.id,
    included_usage:
      ent.allowance_type == AllowanceType.Unlimited ? Infinite : ent.allowance,
    interval: entToItemInterval(ent.interval!),

    entity_feature_id: ent.entity_feature_id,
    carry_over_usage: ent.carry_from_previous,

    // Stored in backend
    entitlement_id: ent.id,
    created_at: ent.created_at,

    // reset_usage_on_billing: true,
  };
};

export const toFeaturePriceItem = ({
  ent,
  price,
}: {
  ent: EntitlementWithFeature;
  price: Price;
}) => {
  let config = price.config as UsagePriceConfig;
  let tiers = config.usage_tiers.map((tier) => {
    return {
      amount: tier.amount,
      to: tier.to == -1 ? TierInfinite : tier.to,
    };
  });

  return {
    feature_id: ent.feature.id,
    included_usage: ent.allowance,
    interval: billingToItemInterval(config.interval!),

    reset_usage_on_billing: ent.interval !== EntInterval.Lifetime,

    amount: null,
    tiers,
    billing_units: config.billing_units,

    entity_feature_id: ent.entity_feature_id,
    carry_over_usage: ent.carry_from_previous,
    usage_model:
      config.bill_when == BillWhen.StartOfPeriod ||
      config.bill_when == BillWhen.InAdvance
        ? UsageModel.Prepaid
        : UsageModel.PayPerUse,

    // Stored in backend
    created_at: ent.created_at,
    entitlement_id: ent.id,
    price_id: price.id,

    price_config: price.config,
  };
};

export const toPriceItem = ({ price }: { price: Price }) => {
  let config = price.config as FixedPriceConfig;
  return {
    feature_id: null,

    interval: billingToItemInterval(config.interval!),
    amount: config.amount,

    price_id: price.id,
    created_at: price.created_at,

    price_config: price.config,
  };
};
