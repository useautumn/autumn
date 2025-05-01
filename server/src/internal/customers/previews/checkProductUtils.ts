import {
  featurePricetoPricecnItem,
  getPriceText,
} from "@/internal/products/pricecn/pricecnUtils.js";
import {
  isFeatureItem,
  isPriceItem,
} from "@/internal/products/product-items/getItemType.js";
import { itemToPriceOrTiers } from "@/internal/products/product-items/productItemUtils.js";
import {
  Feature,
  FullProduct,
  Organization,
  ProductItem,
  ProductV2,
} from "@autumn/shared";

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

  // let { price, tiers } = itemToPriceOrTiers(item);
  let priceStr = getPriceText({
    item,
    org,
  });

  if (isPriceItem(item)) {
    let baseName = prices.length == 1 ? product.name : "Base";
    return `${baseName} - ${priceStr}`;
  } else {
    let feature = features.find((f) => f.id === item.feature_id);
    let pricecnItem = featurePricetoPricecnItem({
      feature,
      item,
      org,
    });
    let combinedStr = pricecnItem.primaryText + " " + pricecnItem.secondaryText;
    combinedStr = `${feature?.name} - ${combinedStr}`;
    if (item.usage_model == "pay_per_use") {
      combinedStr = `${combinedStr}`;
    }
    return combinedStr;
  }
};
