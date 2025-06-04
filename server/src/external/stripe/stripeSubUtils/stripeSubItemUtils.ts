import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { notNullish } from "@/utils/genUtils.js";
import {
  FullCusProduct,
  Price,
  prices,
  UsagePriceConfig,
} from "@autumn/shared";
import Stripe from "stripe";

export const findStripeItemForPrice = ({
  price,
  stripeItems,
}: {
  price: Price;
  stripeItems:
    | Stripe.SubscriptionItem[]
    | Stripe.InvoiceLineItem[]
    | Stripe.LineItem[];
}) => {
  return stripeItems.find(
    (
      si: Stripe.SubscriptionItem | Stripe.InvoiceLineItem | Stripe.LineItem,
    ) => {
      const config = price.config as UsagePriceConfig;
      return (
        config.stripe_price_id == si.price?.id ||
        config.stripe_product_id == si.price?.product
      );
    },
  );
};

export const findPriceInStripeItems = ({
  prices,
  subItem,
}: {
  prices: Price[];
  subItem: Stripe.SubscriptionItem | Stripe.InvoiceLineItem;
}) => {
  return prices.find((p: Price) => {
    let config = p.config;
    return (
      config.stripe_price_id == subItem.price?.id ||
      config.stripe_product_id == subItem.price?.product
    );
  });
};

export const subItemInCusProduct = ({
  cusProduct,
  subItem,
}: {
  cusProduct: FullCusProduct;
  subItem: Stripe.SubscriptionItem;
}) => {
  let stripeProdId = cusProduct.product.processor?.id;

  let prices = cusProductToPrices({ cusProduct });
  let price = findPriceInStripeItems({ prices, subItem });

  return stripeProdId == subItem.price.product || notNullish(price);
};
