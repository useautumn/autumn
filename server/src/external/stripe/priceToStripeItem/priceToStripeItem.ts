import {
  getBillingType,
  priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";

import {
  BillingType,
  ErrCode,
  FeatureOptions,
  FixedPriceConfig,
  FullProduct,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { EntitlementWithFeature, Price, APIVersion } from "@autumn/shared";

import {
  priceToOneOffAndTiered,
  priceToUsageInAdvance,
} from "./priceToUsageInAdvance.js";
import { priceToInArrearProrated } from "./priceToArrearProrated.js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";

export const getEmptyPriceItem = ({
  price,
  org,
}: {
  price: Price;
  org: Organization;
}) => {
  return {
    price_data: {
      product: price.config!.stripe_product_id!,
      unit_amount: 0,
      currency: org.default_currency || "usd",
      recurring: {
        ...billingIntervalToStripe({
          interval: price.config!.interval!,
          intervalCount: price.config!.interval_count!,
        }),
      },
    },
    quantity: 1,
  };
};

// GET STRIPE LINE / SUB ITEM
export const priceToStripeItem = ({
  price,
  relatedEnt,
  product,
  org,
  options,
  isCheckout = false,
  existingUsage,
  withEntity = false,
  apiVersion,
}: {
  price: Price;
  relatedEnt: EntitlementWithFeature;
  product: FullProduct;
  org: Organization;
  options: FeatureOptions | undefined | null;
  isCheckout: boolean;
  existingUsage: number;
  withEntity: boolean;
  apiVersion?: APIVersion;
}) => {
  // TODO: Implement this
  const billingType = getBillingType(price.config!);
  const stripeProductId = product.processor?.id;

  if (!stripeProductId) {
    throw new RecaseError({
      code: ErrCode.ProductNotFound,
      message: "Product not created in Stripe",
      statusCode: 400,
    });
  }

  let lineItemMeta = null;
  let lineItem = null;

  // 1. FIXED PRICE
  if (
    billingType == BillingType.FixedCycle ||
    billingType == BillingType.OneOff
  ) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      price: config.stripe_price_id,
      quantity: 1,
    };
  }

  // 2. PREPAID, TIERED, ONE OFF
  else if (
    billingType == BillingType.UsageInAdvance &&
    priceIsOneOffAndTiered(price, relatedEnt)
  ) {
    lineItem = priceToOneOffAndTiered({
      price,
      options,
      relatedEnt,
      org,
      stripeProductId,
    });
  }

  // 3. PREPAID
  else if (billingType == BillingType.UsageInAdvance) {
    lineItem = priceToUsageInAdvance({
      price,
      options,
      isCheckout,
      relatedEnt,
    });
  }

  // 4. USAGE IN ARREAR
  else if (billingType == BillingType.UsageInArrear) {
    const config = price.config as UsagePriceConfig;
    const priceId = config.stripe_price_id;

    if (withEntity && !isCheckout) {
      return {
        lineItem: {
          price: config.stripe_empty_price_id,
          quantity: 0,
        },
      };
    }

    if (apiVersion === APIVersion.v1_4 && !isCheckout) {
      return {
        lineItem: {
          // lineItem: getEmptyPriceItem({ price, org }),
          price: config.stripe_empty_price_id,
          quantity: 0,
        },
      };
    }

    if (!priceId) {
      throw new RecaseError({
        code: ErrCode.PriceNotFound,
        message: `Couldn't find Autumn price: ${price.id} in Stripe`,
        statusCode: 400,
      });
    }

    lineItem = {
      price: priceId,
    };
  }

  // 5. USAGE ARREAR PRORATED
  else if (billingType == BillingType.InArrearProrated) {
    lineItem = priceToInArrearProrated({
      price,
      isCheckout,
      existingUsage,
    });
  }

  if (!lineItem) {
    return null;
  }

  return {
    lineItem,
    lineItemMeta,
  };
};
