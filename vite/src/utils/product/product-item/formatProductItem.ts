import {
  Feature,
  Organization,
  ProductItem,
  ProductItemType,
} from "@autumn/shared";
import { formatAmount, getItemType, intervalIsNone } from "../productItemUtils";

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

  let feature = features.find((f: Feature) => f.id == item.feature_id);

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
  let currency = org?.default_currency || "USD";
  let formattedAmount = formatAmount({
    defaultCurrency: currency,
    amount: item.price!,
  });

  if (!intervalIsNone(item.interval)) {
    return `${formattedAmount} per ${item.interval}`;
  }

  return `${formattedAmount}`;
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
  let itemType = getItemType(item);

  if (itemType == ProductItemType.FeaturePrice) {
    return getPaidFeatureString({ item, org, features });
  } else if (itemType == ProductItemType.Price) {
    return getFixedPriceString({ item, org });
  }
};
