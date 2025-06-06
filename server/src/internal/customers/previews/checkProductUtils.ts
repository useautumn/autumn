import {
  featurePricetoPricecnItem,
  getPriceText,
} from "@/internal/products/pricecn/pricecnUtils.js";
import {
  isFeatureItem,
  isPriceItem,
} from "@/internal/products/product-items/productItemUtils/getItemType.js";

import { Feature, Organization, ProductItem, ProductV2 } from "@autumn/shared";
import { formatCurrency, formatTiers } from "./previewUtils.js";
import { isFeaturePriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";
import { notNullish } from "@/utils/genUtils.js";
import { getFeatureNameWithCapital } from "@/internal/features/utils/displayUtils.js";

export const getProductChargeText = ({
  product,
  org,
  features,
}: {
  product: ProductV2;
  org: Organization;
  features: Feature[];
}) => {
  let basePrices = product.items.filter((i) => isPriceItem(i));
  let total = basePrices.reduce((acc, curr) => acc + curr.price!, 0);

  let itemStrs = [];
  if (total > 0) {
    itemStrs.push(
      formatCurrency({
        amount: total,
        defaultCurrency: org.default_currency,
      }),
    );
  }

  let prepaidPrices = product.items.filter(
    (i) => isFeaturePriceItem(i) && i.usage_model == "prepaid",
  );

  let prepaidStrings = prepaidPrices.map((i) => {
    let feature = features.find((f) => f.id === i.feature_id);
    let priceStr = formatTiers({
      tiers: i.tiers!,
      org,
    });

    let featureStr =
      i.billing_units && i.billing_units > 1
        ? `${i.billing_units} ${feature?.name}`
        : feature?.name;

    return `${priceStr} / ${featureStr}`;
  });
  return [...itemStrs, ...prepaidStrings];
};

export const getItemDescription = ({
  item,
  features,
  product,
  org,
}: {
  item: ProductItem;
  features: Feature[];
  product: ProductV2;
  org: Organization;
}) => {
  let prices = product.items.filter((i) => !isFeatureItem(i));

  let priceStr = getPriceText({
    item,
    org,
  });

  if (isPriceItem(item)) {
    let baseName =
      prices.length == 1
        ? product.name
        : notNullish(item.interval)
          ? "Subscription"
          : "One-time";

    return baseName;
  } else {
    let feature = features.find((f) => f.id === item.feature_id);
    // let pricecnItem = featurePricetoPricecnItem({
    //   feature,
    //   item,
    //   org,
    // });

    // // let combinedStr = pricecnItem.primaryText + " " + pricecnItem.secondaryText;
    // // combinedStr = `${feature?.name} - ${combinedStr}`;
    // // if (item.usage_model == "pay_per_use") {
    // //   combinedStr = `${combinedStr}`;
    // // }
    return `${getFeatureNameWithCapital({ feature: feature! })}`;
  }
};
