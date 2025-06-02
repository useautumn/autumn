import { notNullish, nullish } from "@/utils/genUtils.js";
import {
  EntInterval,
  ProductItemInterval,
  BillingInterval,
  ProductItem,
  ProductItemType,
  UsageModel,
  Infinite,
  ProductItemFeatureType,
  Feature,
  FeatureType,
} from "@autumn/shared";
import { isFeatureItem } from "./getItemType.js";
import {
  billingToItemInterval,
  entToItemInterval,
} from "./itemIntervalUtils.js";

export const itemToPriceOrTiers = (item: ProductItem) => {
  if (item.price) {
    return {
      price: item.price,
    };
  } else if (item.tiers) {
    if (item.tiers.length > 1) {
      return {
        tiers: item.tiers,
      };
    } else {
      return {
        price: item.tiers[0].amount,
      };
    }
  }
};
export const getItemFeatureType = ({
  item,
  features,
}: {
  item: ProductItem;
  features: Feature[];
}) => {
  let feature = features.find((f) => f.id == item.feature_id);

  if (feature) {
    if (feature.type == FeatureType.Boolean) {
      return ProductItemFeatureType.Static;
    } else if (feature.type == FeatureType.CreditSystem) {
      return ProductItemFeatureType.SingleUse;
    } else {
      return feature.config?.usage_type;
    }
  }

  return undefined;
};

// FOR TESTS?
export const constructFeatureItem = ({
  feature_id,
  included_usage,
  interval,
  entitlement_id,
  entity_feature_id,
}: {
  feature_id: string;
  included_usage?: number | string;
  interval?: EntInterval;
  entitlement_id?: string;
  entity_feature_id?: string;
}) => {
  let item: ProductItem = {
    feature_id,
    included_usage: included_usage as number,
    interval: entToItemInterval(interval),
    entitlement_id,
    entity_feature_id,
  };

  return item;
};

export const constructPriceItem = ({
  price,
  interval,
}: {
  price: number;
  interval: BillingInterval;
}) => {
  let item: ProductItem = {
    price: price,
    interval: interval as any,
  };

  return item;
};

export const constructFeaturePriceItem = ({
  feature_id,

  feature_type,
  included_usage,
  price,
  interval,
  usage_model,
  billing_units = 1,
  reset_usage_when_enabled = false,
  entity_feature_id,
}: {
  feature_id: string;
  feature_type?: ProductItemFeatureType;
  included_usage?: number;
  price: number;
  interval: BillingInterval;
  usage_model?: UsageModel;
  billing_units?: number;
  reset_usage_when_enabled?: boolean;
  entity_feature_id?: string;
}) => {
  let item: ProductItem & {
    included_usage: number;
  } = {
    feature_id,
    feature_type,
    included_usage: included_usage as number,
    price,
    interval: billingToItemInterval(interval),
    usage_model,
    billing_units,
    reset_usage_when_enabled,
    entity_feature_id,
  };

  return item;
};
