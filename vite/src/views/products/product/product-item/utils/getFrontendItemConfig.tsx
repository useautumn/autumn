import {
  isFeatureItem,
  isFeaturePriceItem,
  isPriceItem,
} from "@/utils/product/getItemType";
import { FrontendProductItem, ProductItem } from "@autumn/shared";

export const getFrontendItemConfig = (item: ProductItem) => {
  // 1. Convert included usage + tiers

  const finalItem: FrontendProductItem = {
    ...structuredClone(item),
    isPrice: false,
  };

  if (isFeatureItem(item)) return finalItem;

  if (isFeaturePriceItem(item)) {
    console.log("item", item);
    const includedUsage =
      typeof item.included_usage === "number" ? item.included_usage : 0;

    if (includedUsage > 0) {
      const finalTiers = (item.tiers || []).map((tier) => ({
        ...tier,
        to: typeof tier.to === "number" ? tier.to + includedUsage : tier.to,
      }));

      finalItem.tiers = [{ amount: 0, to: includedUsage }, ...finalTiers];
    }

    finalItem.included_usage = 0;
    finalItem.isVariable = true;
  } else if (isPriceItem(item)) {
    finalItem.isVariable = false;
  }

  finalItem.isPrice = true;
  return finalItem;
};
