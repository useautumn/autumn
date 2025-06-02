import {
  ErrCode,
  FeatureItem,
  FeatureItemSchema,
  FeaturePriceItem,
  PriceItem,
  ProductItem,
} from "@autumn/shared";
import {
  isFeatureItem,
  isFeaturePriceItem,
  isPriceItem,
} from "./getItemType.js";
import RecaseError from "@/utils/errorUtils.js";

export const findSimilarItem = ({
  item,
  items,
}: {
  item: ProductItem;
  items: ProductItem[];
}) => {
  // 1. If feature item
  if (isFeatureItem(item) || isFeaturePriceItem(item)) {
    return items.find((i) => i.feature_id === item.feature_id);
  }

  // 2. If price item
  if (isPriceItem(item)) {
    return items.find((i) => {
      return (
        isPriceItem(i) && i.price === item.price && i.interval === item.interval
      );
    });
  }

  return null;
};

const tiersAreSame = (tiers1: any, tiers2: any) => {
  if (!tiers1 && !tiers2) {
    return true;
  }

  if (!tiers1 || !tiers2) {
    return false;
  }

  if (tiers1.length !== tiers2.length) {
    return false;
  }

  return tiers1.every(
    (tier: any, index: number) =>
      tier.amount === tiers2[index].amount && tier.to === tiers2[index].to,
  );
};

export const featureItemsAreSame = ({
  item1,
  item2,
}: {
  item1: FeatureItem;
  item2: FeatureItem;
}) => {
  return (
    item1.feature_id === item2.feature_id &&
    item1.included_usage == item2.included_usage &&
    item1.interval == item2.interval &&
    item1.entity_feature_id == item2.entity_feature_id &&
    item1.reset_usage_when_enabled == item2.reset_usage_when_enabled
  );
};

export const priceItemsAreSame = ({
  item1,
  item2,
}: {
  item1: PriceItem;
  item2: PriceItem;
}) => {
  return item1.price === item2.price && item1.interval == item2.interval;
};

export const featurePriceItemsAreSame = ({
  item1,
  item2,
}: {
  item1: FeaturePriceItem;
  item2: FeaturePriceItem;
}) => {
  const same = {
    feature_id: {
      condition: item1.feature_id === item2.feature_id,
      message: `Feature ID different: ${item1.feature_id} != ${item2.feature_id}`,
    },

    included_usage: {
      condition: item1.included_usage == item2.included_usage,
      message: `Included usage different: ${item1.included_usage} != ${item2.included_usage}`,
    },
    interval: {
      condition: item1.interval == item2.interval,
      message: `Interval different: ${item1.interval} != ${item2.interval}`,
    },
    usage_model: {
      condition: item1.usage_model === item2.usage_model,
      message: `Usage model different: ${item1.usage_model} != ${item2.usage_model}`,
    },
    price: {
      condition: item1.price == item2.price,
      message: `Price different: ${item1.price} != ${item2.price}`,
    },
    tiers: {
      condition: tiersAreSame(item1.tiers, item2.tiers),
      message: `Tiers different`,
    },
    billing_units: {
      condition: item1.billing_units != item2.billing_units,
      message: `Billing units different: ${item1.billing_units} !== ${item2.billing_units}`,
    },
    reset_usage_when_enabled: {
      condition:
        item1.reset_usage_when_enabled != item2.reset_usage_when_enabled,
      message: `Reset usage when enabled different: ${item1.reset_usage_when_enabled} !== ${item2.reset_usage_when_enabled}`,
    },
  };

  let itemsAreDiff = Object.values(same).some((d) => !d.condition);
  if (itemsAreDiff) {
    console.log(
      "Feature price items different:",
      Object.values(same)
        .filter((d) => !d.condition)
        .map((d) => d.message),
    );
  }

  return !itemsAreDiff;
};

export const itemsAreSame = ({
  item1,
  item2,
}: {
  item1: ProductItem;
  item2: ProductItem;
}) => {
  // 1. If feature item
  if (isFeatureItem(item1)) {
    return featureItemsAreSame({
      item1: FeatureItemSchema.parse(item1),
      item2: FeatureItemSchema.parse(item2),
    });
  }

  if (isFeaturePriceItem(item1)) {
    return featureItemsAreSame({
      item1: FeatureItemSchema.parse(item1),
      item2: FeatureItemSchema.parse(item2),
    });
  }

  // 2. If price item
  if (isPriceItem(item1)) {
    return (
      isPriceItem(item2) &&
      item1.price === item2.price &&
      item1.interval === item2.interval
    );
  }

  throw new RecaseError({
    message: "Unknown item type",
    code: ErrCode.InvalidRequest,
  });
};
