import { getPriceForOverage } from "@/internal/products/prices/priceUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { FeatureOptions, Organization, UsagePriceConfig } from "@autumn/shared";
import { EntitlementWithFeature } from "@autumn/shared";
import { Price } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const priceToOneOffAndTiered = ({
  price,
  relatedEnt,
  options,
  stripeProductId,
  org,
}: {
  price: Price;
  relatedEnt: EntitlementWithFeature;
  options: FeatureOptions | undefined | null;
  org: Organization;
  stripeProductId: string;
}) => {
  const config = price.config as UsagePriceConfig;
  let quantity = options?.quantity!;
  let overage = quantity * config.billing_units! - relatedEnt.allowance!;

  if (overage <= 0) {
    return null;
  }

  const amount = getPriceForOverage(price, overage);
  if (!config.stripe_product_id) {
    console.log(
      `WARNING: One off & tiered in advance price has no stripe product id: ${price.id}, ${relatedEnt.feature.name}`,
    );
  }
  return {
    price_data: {
      product: config.stripe_product_id
        ? config.stripe_product_id
        : stripeProductId,
      unit_amount: Number(amount.toFixed(2)) * 100,
      currency: org.default_currency,
    },

    quantity: 1,
  };
};

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

  // let minimum = new Decimal(relatedEnt.allowance!)
  //   .div(config.billing_units || 1)
  //   .toNumber();

  const adjustableQuantity =
    isCheckout && adjustable
      ? {
          enabled: true,
          maximum: 999999,
        }
      : undefined;

  return {
    price: config.stripe_price_id,
    quantity: finalQuantity,
    adjustable_quantity: adjustableQuantity,
  };
};
