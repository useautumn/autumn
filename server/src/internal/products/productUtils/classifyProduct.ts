import { FullProduct, Price, ProductV2 } from "@autumn/shared";
import { pricesOnlyOneOff } from "../prices/priceUtils.js";

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
