import {
  BillingInterval,
  BillingType,
  FixedPriceConfig,
  PriceOptions,
  Organization,
  FullProduct,
  Price,
  UsagePriceConfig,
  FeatureOptions,
} from "@autumn/shared";

import { billingIntervalToStripe } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

export const priceToStripeItem = ({
  price,
  product,
  org,
  options,
  isCheckout = false,
}: {
  price: Price;
  product: FullProduct;
  org: Organization;
  options: FeatureOptions | undefined | null;
  isCheckout: boolean;
}) => {
  // TODO: Implement this
  const billingType = price.billing_type;
  const stripeProductId = product.processor?.id;
  console.log("Price", price);

  if (!stripeProductId) {
    throw new RecaseError({
      code: ErrCode.ProductNotFound,
      message: "Product not created in Stripe",
      statusCode: 400,
    });
  }

  let lineItemMeta = null;
  let lineItem = null;
  if (billingType == BillingType.OneOff) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: config.amount * 100,
        currency: org.default_currency,
      },
    };
  } else if (billingType == BillingType.FixedCycle) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: config.amount * 100,
        currency: org.default_currency,
        recurring: billingIntervalToStripe(config.interval as BillingInterval),
      },
    };
  } else if (billingType == BillingType.UsageInAdvance) {
    const config = price.config as UsagePriceConfig;
    const quantity = options?.quantity || 1;

    const adjustableQuantity = isCheckout
      ? {
          enabled: true,
        }
      : undefined;

    lineItem = {
      price_data: {
        product: stripeProductId,
        unit_amount: config.usage_tiers[0].amount * 100,
        currency: org.default_currency,
        recurring: {
          ...billingIntervalToStripe(config.interval as BillingInterval),
        },
      },
      quantity,
      adjustable_quantity: adjustableQuantity,
    };
    lineItemMeta = {
      internal_feature_id: config.internal_feature_id,
      feature_id: config.feature_id,
      price_id: price.id,
    };
  }

  return {
    lineItem,
    lineItemMeta,
  };
};
