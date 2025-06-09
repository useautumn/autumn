import { isPriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";
import { nullish } from "@/utils/genUtils.js";
import { BillingInterval, ProductItem, ProductV2 } from "@autumn/shared";

export const addPrefixToProducts = ({
  products,
  prefix,
}: {
  products: ProductV2[];
  prefix: string;
}) => {
  for (const product of products) {
    product.id = `${prefix}_${product.id}`;
    product.name = `${prefix} ${product.name}`;
    product.group = prefix;
  }

  return products;
};

export const replaceItems = ({
  featureId,
  interval,
  newItem,
  items,
}: {
  featureId?: string;
  interval?: BillingInterval;
  newItem: ProductItem;
  items: ProductItem[];
}) => {
  let newItems = structuredClone(items);

  let index;
  if (featureId) {
    index = newItems.findIndex((item) => item.feature_id == featureId);
  }

  if (interval) {
    index = newItems.findIndex(
      (item) => item.interval == (interval as any) && nullish(item.feature_id),
    );
  }

  if (index == -1) {
    throw new Error("Item not found");
  }

  newItems[index!] = newItem;

  return newItems;
};

export const getBasePrice = ({ product }: { product: ProductV2 }) => {
  return product.items.find((item) => isPriceItem(item))?.price || 0;
};
