import { ProductItemType, ProductV2 } from "@autumn/shared";

import { ProductItem } from "@autumn/shared";
import { getItemType } from "./product/productItemUtils";

export const sortProductItems = (items: ProductItem[]) => {
  const sortedItems = [...items].sort((a, b) => {
    const typeA = getItemType(a);
    const typeB = getItemType(b);

    const typeOrder = {
      [ProductItemType.Feature]: 0,
      [ProductItemType.FeaturePrice]: 1,
      [ProductItemType.Price]: 2,
    };

    return typeOrder[typeA] - typeOrder[typeB];
  });

  return sortedItems;
};

export const getVersionCounts = (products: ProductV2[]) => {
  return products.reduce((acc: any, product: any) => {
    acc[product.id] = product.version;
    return acc;
  }, {});
};
