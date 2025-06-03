import {
  Feature,
  FeatureType,
  Infinite,
  Organization,
  ProductItem,
  ProductItemType,
} from "@autumn/shared";
import { formatAmount, getItemType, intervalIsNone } from "../productItemUtils";
import { getFeature } from "../entitlementUtils";
import { notNullish } from "@/utils/genUtils";

const getPaidFeatureString = ({
  item,
  org,
  features,
}: {
  item: ProductItem;
  org: Organization;
  features: Feature[];
}) => {
  let amountStr = "";

  if (item.price) {
    amountStr = formatAmount({
      defaultCurrency: org?.default_currency || "USD",
      amount: item.price,
    });
  } else if (item.tiers && item.tiers.length == 1) {
    amountStr = formatAmount({
      defaultCurrency: org?.default_currency || "USD",
      amount: item.tiers![0].amount,
    });
  } else {
    amountStr = `${formatAmount({
      defaultCurrency: org?.default_currency || "USD",
      amount: item.tiers![0].amount,
    })} - ${formatAmount({
      defaultCurrency: org?.default_currency || "USD",
      amount: item.tiers![item.tiers!.length - 1].amount,
    })}`;
  }

  const feature = features.find((f: Feature) => f.id == item.feature_id);

  amountStr += ` per ${item.billing_units! > 1 ? item.billing_units : ""} ${
    feature?.name
  }`;

  if (!intervalIsNone(item.interval)) {
    amountStr += ` per ${item.interval}`;
  }

  if (item.included_usage) {
    return `${item.included_usage} ${feature?.name} free, then ${amountStr}`;
  } else {
    return amountStr;
  }
};

const getFixedPriceString = ({
  item,
  org,
}: {
  item: ProductItem;
  org: Organization;
}) => {
  const currency = org?.default_currency || "USD";
  const formattedAmount = formatAmount({
    defaultCurrency: currency,
    amount: item.price!,
  });

  if (!intervalIsNone(item.interval)) {
    return `${formattedAmount} per ${item.interval}`;
  }

  return `${formattedAmount}`;
};

export const getFeatureString = ({
  item,
  features,
}: {
  item: ProductItem;
  features: Feature[];
}) => {
  const feature = features.find((f: Feature) => f.id == item.feature_id);

  if (feature?.type === FeatureType.Boolean) {
    return `${feature.name}`;
  }

  if (item.included_usage == Infinite) {
    return `Unlimited ${feature?.name}`;
  }

  return `${item.included_usage ?? 0} ${feature?.name}${item.entity_feature_id ? ` per ${getFeature(item.entity_feature_id, features)?.name}` : ""}${notNullish(item.interval) ? ` per ${item.interval}` : ""}`;
};

export const formatProductItemText = ({
  item,
  org,
  features,
}: {
  item: ProductItem;
  org: Organization;
  features: Feature[];
}) => {
  const itemType = getItemType(item);

  if (itemType == ProductItemType.FeaturePrice) {
    return getPaidFeatureString({ item, org, features });
  } else if (itemType == ProductItemType.Price) {
    return getFixedPriceString({ item, org });
  }
};
