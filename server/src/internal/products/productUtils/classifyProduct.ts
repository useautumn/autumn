import { FullProduct, Price, ProductV2 } from "@autumn/shared";
import { pricesOnlyOneOff } from "../prices/priceUtils.js";
import { isFeatureItem } from "../product-items/getItemType.js";

export const prodIsAddOn = ({ product }: { product: FullProduct }) => {
  return product.is_add_on;
};

export const oneOffOrAddOn = ({
  product,
  prices,
}: {
  product: FullProduct;
  prices?: Price[];
}) => {
  const isOneOff = prices
    ? pricesOnlyOneOff(prices)
    : pricesOnlyOneOff(product.prices);

  return prodIsAddOn({ product }) || isOneOff;
};

export const isMainProduct = ({
  product,
  prices,
}: {
  product: FullProduct;
  prices?: Price[];
}) => {
  return !prodIsAddOn({ product }) && !oneOffOrAddOn({ product, prices });
};

export const isFreeProductV2 = ({ product }: { product: ProductV2 }) => {
  return product.items.every((item) => isFeatureItem(item));
};
