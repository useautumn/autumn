import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import {
  BillingType,
  FullCusProduct,
  Price,
  prices,
  PriceType,
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

// TO FIX
export const findStripeItemForPrice = ({
  price,
  stripeItems,
  stripeProdId,
}: {
  price: Price;
  stripeItems?: Stripe.SubscriptionItem[] | Stripe.LineItem[];
  stripeProdId?: string;
}) => {
  if (stripeItems) {
    return stripeItems.find((si: Stripe.SubscriptionItem | Stripe.LineItem) => {
      const config = price.config as UsagePriceConfig;

      if (config.type == PriceType.Fixed) {
        return (
          config.stripe_price_id == si.price?.id ||
          (stripeProdId && si.price?.product == stripeProdId)
        );
      } else {
        return (
          config.stripe_price_id == si.price?.id ||
          config.stripe_product_id == si.price?.product ||
          config.stripe_empty_price_id == si.price?.id
        );
      }
    });
  }
};

export const findPriceInStripeItems = ({
  prices,
  subItem,
  lineItem,
  billingType,
}: {
  prices: Price[];
  subItem?: Stripe.SubscriptionItem;
  lineItem?: Stripe.InvoiceItem | Stripe.InvoiceLineItem;
  billingType?: BillingType;
}) => {
  return prices.find((p: Price) => {
    let config = p.config;

    let itemMatch;
    if (subItem) {
      itemMatch =
        config.stripe_price_id == subItem.price?.id ||
        config.stripe_product_id == subItem.price?.product;
    }

    if (lineItem) {
      const priceDetails = lineItem.pricing?.price_details;
      itemMatch =
        config.stripe_price_id == priceDetails?.price ||
        config.stripe_product_id == priceDetails?.product;
    }

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
    })
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
  stripeItem: Stripe.SubscriptionItem | Stripe.LineItem;
}) => {
  return stripeItem.price?.recurring?.usage_type == "licensed";
};

export const isMeteredItem = ({
  stripeItem,
}: {
  stripeItem: Stripe.SubscriptionItem | Stripe.LineItem;
}) => {
  return stripeItem.price?.recurring?.usage_type == "metered";
};
