import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import {
  BillingType,
  FullCusProduct,
  Price,
  prices,
  UsagePriceConfig,
} from "@autumn/shared";
import Stripe from "stripe";

const autumnStripePricesMatch = ({
  stripePrice,
  autumnPrice,
}: {
  stripePrice: Stripe.Price;
  autumnPrice: Price;
}) => {
  const config = autumnPrice.config as UsagePriceConfig;
  return (
    config.stripe_price_id == stripePrice.id ||
    config.stripe_product_id == stripePrice.product
  );
};

export const findStripeItemForPrice = ({
  price,
  stripeItems,
  stripeProdId,
}: {
  price: Price;
  stripeItems:
    | Stripe.SubscriptionItem[]
    | Stripe.InvoiceLineItem[]
    | Stripe.LineItem[];
  stripeProdId?: string;
}) => {
  return stripeItems.find(
    (
      si: Stripe.SubscriptionItem | Stripe.InvoiceLineItem | Stripe.LineItem,
    ) => {
      const config = price.config as UsagePriceConfig;
      return (
        config.stripe_price_id == si.price?.id ||
        config.stripe_product_id == si.price?.product ||
        (stripeProdId && si.price?.product == stripeProdId)
      );
    },
  );
};

export const findPriceInStripeItems = ({
  prices,
  subItem,
  billingType,
}: {
  prices: Price[];
  subItem: Stripe.SubscriptionItem | Stripe.InvoiceLineItem;
  billingType?: BillingType;
}) => {
  return prices.find((p: Price) => {
    let config = p.config;
    let itemMatch =
      config.stripe_price_id == subItem.price?.id ||
      config.stripe_product_id == subItem.price?.product;

    const priceBillingType = getBillingType(config);
    let billingTypeMatch = billingType ? priceBillingType == billingType : true;

    return itemMatch && billingTypeMatch;
  });
};

export const findStripePriceFromPrices = ({
  stripePrices,
  autumnPrice,
}: {
  stripePrices: Stripe.Price[];
  autumnPrice: Price;
}) => {
  return stripePrices.find((p: Stripe.Price) =>
    autumnStripePricesMatch({
      stripePrice: p,
      autumnPrice,
    }),
  );
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

export const isLicenseItem = ({
  stripeItem,
}: {
  stripeItem:
    | Stripe.SubscriptionItem
    | Stripe.InvoiceLineItem
    | Stripe.LineItem;
}) => {
  return stripeItem.price?.recurring?.usage_type == "licensed";
};

export const isMeteredItem = ({
  stripeItem,
}: {
  stripeItem:
    | Stripe.SubscriptionItem
    | Stripe.InvoiceLineItem
    | Stripe.LineItem;
}) => {
  return stripeItem.price?.recurring?.usage_type == "metered";
};
