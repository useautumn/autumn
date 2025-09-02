import {
  BillingInterval,
  Feature,
  FeatureType,
  FrontendOrg,
  Infinite,
  Organization,
  ProductItem,
  ProductItemType,
} from "@autumn/shared";
import { formatAmount, getItemType, intervalIsNone } from "../productItemUtils";
import { getFeature } from "../entitlementUtils";
import { notNullish } from "@/utils/genUtils";
import { ProductItemInterval } from "autumn-js";

const getIntervalString = ({
  interval,
  intervalCount = 1,
}: {
  interval: ProductItemInterval;
  intervalCount?: number | null;
}) => {
  if (!interval) return "";

  if (intervalCount == 1) {
    return `per ${interval}`;
  }

  return `per ${intervalCount} ${interval}s`;
};

export const getPaidFeatureString = ({
  item,
  currency = "USD",
  features,
}: {
  item: ProductItem;
  currency?: string;
  features: Feature[];
}) => {
  let amountStr = "";

  if (item.price) {
    amountStr = formatAmount({
      defaultCurrency: currency,
      amount: item.price,
    });
  } else if (item.tiers && item.tiers.length == 1) {
    amountStr = formatAmount({
      defaultCurrency: currency,
      amount: item.tiers![0].amount,
    });
  } else {
    amountStr = `${formatAmount({
      defaultCurrency: currency,
      amount: item.tiers![0].amount,
    })} - ${formatAmount({
      defaultCurrency: currency,
      amount: item.tiers![item.tiers!.length - 1].amount,
    })}`;
  }

  const feature = features.find((f: Feature) => f.id == item.feature_id);

  amountStr += ` per ${item.billing_units! > 1 ? item.billing_units : ""} ${
    feature?.name
  }`;

  if (!intervalIsNone(item.interval)) {
    const intervalStr = getIntervalString({
      interval: item.interval!,
      intervalCount: item.interval_count,
    });
    amountStr += ` ${intervalStr}`;
  }

  if (item.included_usage) {
    return `${item.included_usage} ${feature?.name} free, then ${amountStr}`;
  } else {
    return amountStr;
  }
};

const getFixedPriceString = ({
  item,
  currency = "USD",
}: {
  item: ProductItem;
  currency?: string;
}) => {
  const formattedAmount = formatAmount({
    defaultCurrency: currency,
    amount: item.price!,
  });

  if (!intervalIsNone(item.interval)) {
    const intervalStr = getIntervalString({
      interval: item.interval!,
      intervalCount: item.interval_count,
    });
    return `${formattedAmount} ${intervalStr}`;
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

  const intervalStr = getIntervalString({
    interval: item.interval!,
    intervalCount: item.interval_count,
  });

  return `${item.included_usage ?? 0} ${feature?.name}${item.entity_feature_id ? ` per ${getFeature(item.entity_feature_id, features)?.name}` : ""}${notNullish(item.interval) ? ` ${intervalStr}` : ""}`;
};

export const formatProductItemText = ({
  item,
  org,
  features,
}: {
  item: ProductItem;
  org?: FrontendOrg;
  features: Feature[];
}) => {
  if (!item) return "";

  const itemType = getItemType(item);

  if (itemType == ProductItemType.FeaturePrice) {
    return getPaidFeatureString({
      item,
      currency: org?.default_currency,
      features,
    });
  } else if (itemType == ProductItemType.Price) {
    return getFixedPriceString({ item, currency: org?.default_currency });
  }
};
