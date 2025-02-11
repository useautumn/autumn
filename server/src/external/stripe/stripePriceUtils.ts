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
  Entitlement,
  Feature,
  Product,
  AllowanceType,
  EntitlementWithFeature,
} from "@autumn/shared";

import { billingIntervalToStripe } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import Stripe from "stripe";

export const priceToStripeItem = ({
  price,
  product,
  org,
  options,
  isCheckout = false,
  relatedEnt,
}: {
  price: Price;
  product: FullProduct;
  org: Organization;
  options: FeatureOptions | undefined | null;
  isCheckout: boolean;
  relatedEnt: EntitlementWithFeature | undefined;
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

  let lineItemMeta = null;
  let lineItem = null;
  if (billingType == BillingType.OneOff) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: Math.round(config.amount * 100),
        currency: org.default_currency,
      },
    };
  } else if (billingType == BillingType.FixedCycle) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: Math.round(config.amount * 100),
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

    const productData =
      isCheckout && relatedEnt
        ? {
            product_data: {
              name: `${product.name} - ${relatedEnt.feature.name} (${relatedEnt.allowance})`,
            },
          }
        : {
            product: stripeProductId,
          };

    lineItem = {
      price_data: {
        ...productData,
        unit_amount: Math.round(config.usage_tiers[0].amount * 100),
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
  } else if (billingType == BillingType.UsageInArrear) {
    // TODO: Implement this
    const config = price.config as UsagePriceConfig;
    const priceId = config.stripe_price_id;

    if (!priceId) {
      throw new RecaseError({
        code: ErrCode.PriceNotFound,
        message: `Couldn't find price: ${price.name}, ${price.id} in Stripe`,
        statusCode: 400,
      });
    }

    lineItem = {
      price: priceId,
    };
  }

  return {
    lineItem,
    lineItemMeta,
  };
};

export const priceToStripeTiers = (price: Price, entitlement: Entitlement) => {
  let usageConfig = structuredClone(price.config) as UsagePriceConfig;
  const tiers: any[] = [];
  if (entitlement.allowance) {
    tiers.push({
      unit_amount: 0,
      up_to: entitlement.allowance,
    });

    for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
      usageConfig.usage_tiers[i].from += entitlement.allowance;
      if (usageConfig.usage_tiers[i].to != -1) {
        usageConfig.usage_tiers[i].to += entitlement.allowance;
      }
    }
  }

  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    const tier = usageConfig.usage_tiers[i];
    const amount = (tier.amount / (usageConfig.billing_units ?? 1)) * 100;

    tiers.push({
      // unit_amount: Math.round(
      //   (tier.amount / (usageConfig.billing_units ?? 1)) * 100
      // ),
      unit_amount_decimal: amount.toFixed(5),
      up_to: tier.to == -1 ? "inf" : tier.to,
    });
  }

  console.log("Tiers: ", tiers);
  return tiers;
};

export const createStripeMeteredPrice = async ({
  stripeCli,
  meterId,
  product,
  price,
  entitlements,
  feature,
}: {
  stripeCli: Stripe;
  meterId: string;
  product: Product;
  price: Price;
  entitlements: Entitlement[];
  feature: Feature;
}) => {
  const relatedEntitlement = entitlements.find(
    (e) => e.internal_feature_id === feature!.internal_id
  );

  const isOverage =
    relatedEntitlement?.allowance_type == AllowanceType.Fixed &&
    relatedEntitlement.allowance &&
    relatedEntitlement.allowance > 0;

  let overageStr = "";
  // if (isOverage) {
  //   overageStr = ` (overage)`;
  // }

  const tiers = priceToStripeTiers(
    price,
    entitlements.find((e) => e.internal_feature_id === feature!.internal_id)!
  );

  let priceAmountData = {};

  if (tiers.length == 1) {
    priceAmountData = {
      unit_amount: tiers[0].unit_amount,
    };
  } else {
    priceAmountData = {
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: tiers,
    };
  }

  return await stripeCli.prices.create({
    // product: product.processor!.id,
    product_data: {
      name: `${product.name} - ${feature!.name}${overageStr}`,
    },

    ...priceAmountData,
    currency: "usd",
    recurring: {
      ...(billingIntervalToStripe(price.config!.interval!) as any),
      meter: meterId,
      usage_type: "metered",
    },
  });
};
