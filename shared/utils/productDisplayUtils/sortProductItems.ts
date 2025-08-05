import { Feature } from "../../models/featureModels/featureModels.js";
import { ProductItem } from "../../models/productV2Models/productItemModels/productItemModels.js";
import { isFeaturePriceItem, isPriceItem } from "./getItemType.js";

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
