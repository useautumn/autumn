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
}: {
  price: Price;
  product: FullProduct;
  org: Organization;
  options: FeatureOptions | undefined | null;
}) => {
  // TODO: Implement this
  const billingType = price.billing_type;
  const stripeProductId = product.processor?.id;

  if (!stripeProductId) {
    throw new RecaseError({
      code: ErrCode.ProductNotFound,
      message: "Product not created in Stripe",
      statusCode: 400,
    });
  }

  if (billingType == BillingType.OneOff) {
    const config = price.config as FixedPriceConfig;

    return {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: config.amount * 100,
        currency: org.default_currency,
      },
    };
  } else if (billingType == BillingType.FixedCycle) {
    const config = price.config as FixedPriceConfig;

    return {
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

    if (!options?.quantity) {
      throw new RecaseError({
        code: ErrCode.InvalidOptions,
        message:
          "Price options are required for in advance usage prices. Missing: `quantity`",
        statusCode: 400,
      });
    }

    return {
      price_data: {
        product: stripeProductId,
        unit_amount: config.usage_tiers[0].amount * 100,
        currency: org.default_currency,
        recurring: {
          ...billingIntervalToStripe(config.interval as BillingInterval),
        },
      },
      quantity: options.quantity,
    };
  }

  return null;
};
