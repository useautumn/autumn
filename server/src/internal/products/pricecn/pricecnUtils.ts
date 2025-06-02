import {
  ProductV2,
  Feature,
  ProductItem,
  Organization,
  ProductItemFeatureType,
  ErrCode,
  Infinite,
  FullCusProduct,
  CusProductStatus,
} from "@autumn/shared";
import { features } from "process";
import { isPriceItem } from "../product-items/getItemType.js";
import { isFeaturePriceItem } from "../product-items/getItemType.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { numberWithCommas } from "tests/utils/general/numberUtils.js";
import { getFeatureName } from "@/internal/features/utils/displayUtils.js";

export const sortProductItems = (items: ProductItem[], features: Feature[]) => {
  items.sort((a, b) => {
    let aIsPriceItem = isPriceItem(a);
    let bIsPriceItem = isPriceItem(b);

    if (aIsPriceItem && bIsPriceItem) {
      return 0;
    }

    if (aIsPriceItem && !bIsPriceItem) {
      return -1;
    }

    if (!aIsPriceItem && bIsPriceItem) {
      return 1;
    }

    // 2. Put feature price next
    let aIsFeatureItem = isFeaturePriceItem(a);
    let bIsFeatureItem = isFeaturePriceItem(b);

    if (aIsFeatureItem && !bIsFeatureItem) {
      return -1;
    }

    if (!aIsFeatureItem && bIsFeatureItem) {
      return 1;
    }

    // 3. Put feature price items in alphabetical order
    let feature = features.find((f) => f.id == a.feature_id);
    let aFeatureName = feature?.name;
    let bFeatureName = features.find((f) => f.id == b.feature_id)?.name;

    if (!aFeatureName || !bFeatureName) {
      return 0;
    }

    return aFeatureName.localeCompare(bFeatureName);
  });

  return items;
};

export const getIncludedFeatureName = ({
  item,
  feature,
}: {
  item: ProductItem;
  feature: Feature;
}) => {
  return getFeatureName({
    feature,
    plural: typeof item.included_usage === "number" && item.included_usage > 1,
  });
};

export const getPriceText = ({
  item,
  org,
}: {
  item: ProductItem;
  org: Organization;
}) => {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: org.default_currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 10,
    }).format(amount);
  };
  if (item.price) {
    return formatAmount(item.price as number);
  }

  let tiers = item.tiers;
  if (tiers) {
    if (tiers.length == 1) {
      return formatAmount(tiers[0].amount);
    }

    let firstPrice = tiers[0].amount;
    let lastPrice = tiers[tiers.length - 1].amount;

    return `${formatAmount(firstPrice)} - ${formatAmount(lastPrice)}`;
  }
};

export const getPricecnPrice = ({
  org,
  items,
  features,
  isMainPrice = true,
}: {
  org: Organization;
  features: Feature[];
  items: ProductItem[];
  isMainPrice?: boolean;
}) => {
  let priceExists = items.some((i) => isPriceItem(i) || isFeaturePriceItem(i));

  if (!priceExists) {
    return {
      primaryText: "Free",
      secondaryText: " ",
    };
  }

  let priceItem = items[0];

  if (isPriceItem(priceItem)) {
    return {
      primaryText: getPriceText({ item: priceItem, org }),
      secondaryText: `per ${priceItem.interval}`,
    };
  } else {
    let feature = features.find((f) => f.id == priceItem.feature_id);
    return featurePricetoPricecnItem({
      feature,
      item: priceItem,
      org,
      isMainPrice,
    });
  }
};

export const featureToPricecnItem = ({
  feature,
  item,
}: {
  feature?: Feature;
  item: ProductItem;
}) => {
  if (!feature) {
    throw new RecaseError({
      message: `Feature ${item.feature_id} not found`,
      code: ErrCode.FeatureNotFound,
      statusCode: 404,
    });
  }
  // 1. If feature
  if (item.feature_type == ProductItemFeatureType.Static) {
    return {
      primaryText: feature.name,
    };
  }

  let featureName = getIncludedFeatureName({
    feature,
    item,
  });

  let includedUsageTxt =
    item.included_usage == Infinite
      ? "Unlimited "
      : nullish(item.included_usage) || item.included_usage == 0
        ? ""
        : `${numberWithCommas(item.included_usage!)} `;

  return {
    primaryText: `${includedUsageTxt}${featureName}`,
  };
};

export const featurePricetoPricecnItem = ({
  feature,
  item,
  org,
  isMainPrice = false,
  withNameAfterIncluded = false,
}: {
  feature?: Feature;
  item: ProductItem;
  org: Organization;
  isMainPrice?: boolean;
  withNameAfterIncluded?: boolean;
}) => {
  if (!feature) {
    throw new RecaseError({
      message: `Feature ${item.feature_id} not found`,
      code: ErrCode.FeatureNotFound,
      statusCode: 404,
    });
  }

  // 1. Get included usage
  let includedFeatureName = getIncludedFeatureName({
    feature,
    item,
  });

  let includedUsageStr =
    nullish(item.included_usage) || item.included_usage == 0
      ? ""
      : `${numberWithCommas(item.included_usage as number)} ${
          withNameAfterIncluded ? `${includedFeatureName} ` : ""
        }included`;

  let priceStr = getPriceText({ item, org });
  let billingFeatureName = getFeatureName({
    feature,
    plural: typeof item.billing_units == "number" && item.billing_units > 1,
  });

  let priceStr2 = "";
  if (item.billing_units && item.billing_units > 1) {
    priceStr2 = `${numberWithCommas(item.billing_units)} ${billingFeatureName}`;
  } else {
    priceStr2 = `${billingFeatureName}`;
  }

  let intervalStr = isMainPrice && item.interval ? ` per ${item.interval}` : "";

  if (includedUsageStr) {
    return {
      primaryText: includedUsageStr,
      secondaryText: `then ${priceStr} per ${priceStr2}${intervalStr}`,
    };
  }

  return {
    primaryText: priceStr,
    secondaryText: `per ${priceStr2}${intervalStr}`,
  };
};

export const toPricecnProduct = ({
  org,
  product,
  features,
  curMainProduct,
  curScheduledProduct,
}: {
  org: Organization;
  product: ProductV2;
  features: Feature[];
  curMainProduct?: FullCusProduct | null;
  curScheduledProduct?: FullCusProduct | null;
}) => {
  let items = structuredClone(product.items);

  sortProductItems(items, features);

  let priceExists = items.some((i) => isPriceItem(i) || isFeaturePriceItem(i));

  let price = getPricecnPrice({ org, items, features });
  let itemsWithoutPrice = priceExists ? items.slice(1) : items;

  let pricecnItems = itemsWithoutPrice.map((i) => {
    let feature = features.find((f) => f.id == i.feature_id);
    if (isFeaturePriceItem(i)) {
      return featurePricetoPricecnItem({ feature, item: i, org });
    } else {
      return featureToPricecnItem({ feature, item: i });
    }
  });

  let isCurrent = curMainProduct?.product.id == product.id;
  let isScheduled = curScheduledProduct?.product.id == product.id;

  let buttonText = "Get Started";

  if (isCurrent) {
    let isCanceled = curMainProduct!.canceled_at != null;
    let isTrialing = curMainProduct!.trial_ends_at! > Date.now();
    buttonText = isCanceled
      ? "Renew"
      : isTrialing
        ? "Trialing"
        : "Current Plan";
  } else if (isScheduled) {
    buttonText = "Scheduled";
  }

  return {
    id: product.id,
    name: product.name,
    buttonText,
    price: price,
    items: pricecnItems,
    // buttonUrl: org.stripe_config?.success_url,
  };
};
