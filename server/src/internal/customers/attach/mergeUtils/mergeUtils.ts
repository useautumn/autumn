import { getPriceOptions } from "@/internal/products/prices/priceUtils.js";
import { isPrepaidPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { FullCusProduct, Price } from "@autumn/shared";
import Stripe from "stripe";

export const isMultiProductSub = ({
  sub,
  cusProducts,
}: {
  sub: Stripe.Subscription;
  cusProducts: FullCusProduct[];
}) => {
  const cusProductsOnSub = cusProducts.filter((cp) =>
    cp.subscription_ids?.some((id) => id === sub.id)
  );

  return cusProductsOnSub.length > 1;
};

export const getQuantityToRemove = ({
  cusProduct,
  price,
}: {
  cusProduct: FullCusProduct;
  price: Price;
}) => {
  let finalQuantity = 1;

  if (isPrepaidPrice({ price })) {
    const options = getPriceOptions(price, cusProduct.options);

    if (!options) return finalQuantity;

    // Remove quantity
    finalQuantity = options.upcoming_quantity || options.quantity || 1;
  }

  return finalQuantity;
};
