import { nullish } from "@/utils/genUtils.js";
import { FeatureOptions, UsagePriceConfig } from "@autumn/shared";
import { EntitlementWithFeature, Price } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const priceToUsageInAdvance = ({
  price,
  relatedEnt,
  options,
  isCheckout,
}: {
  price: Price;
  relatedEnt: EntitlementWithFeature;
  options: FeatureOptions | undefined | null;
  isCheckout: boolean;
}) => {
  const config = price.config as UsagePriceConfig;
  let optionsQuantity = options?.quantity;
  let finalQuantity = optionsQuantity;

  // 1. If adjustable quantity is set, use that, else if quantity is undefined, adjustable is true, else false
  let adjustable = !nullish(options?.adjustable_quantity)
    ? options!.adjustable_quantity
    : nullish(optionsQuantity)
    ? true
    : false;

  if (optionsQuantity === 0 && isCheckout) {
    // 1. If quantity is 0 and is checkout, skip over line item
    return null;
  } else if (nullish(optionsQuantity) && isCheckout) {
    // 2. If quantity is nullish and is checkout, default to 1
    finalQuantity = 1;
  }

  // Divide final quantity by billing units...?

  let minimum = new Decimal(relatedEnt.allowance!)
    .div(config.billing_units || 1)
    .toNumber();

  const adjustableQuantity =
    isCheckout && adjustable
      ? {
          enabled: true,
          maximum: 999999,
          minimum: minimum,
        }
      : undefined;

  return {
    price: config.stripe_price_id,
    quantity: finalQuantity,
    adjustable_quantity: adjustableQuantity,
  };
};

export const priceToInArrearProrated = ({
  price,

  isCheckout,
  existingUsage,
}: {
  price: Price;
  isCheckout: boolean;
  existingUsage: number;
}) => {
  const config = price.config as UsagePriceConfig;
  let quantity = existingUsage || 0;
  if (quantity == 0 && isCheckout) {
    return {
      price: config.stripe_placeholder_price_id,
    };
  } else {
    return {
      price: config.stripe_price_id,
      quantity,
    };
  }
};
