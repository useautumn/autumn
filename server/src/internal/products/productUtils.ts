import {
  AppEnv,
  BillingInterval,
  BillingType,
  EntitlementWithFeature,
  Feature,
  Organization,
  Price,
  PriceType,
  ProcessorType,
  UsagePriceConfig,
} from "@autumn/shared";
import { FullProduct } from "@autumn/shared";
import {
  compareBillingIntervals,
  getBillingInterval,
  getBillingType,
} from "@/internal/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { ProductService } from "./ProductService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  AttachParams,
  InsertCusProductParams,
} from "../customers/products/AttachParams.js";
import { getEntitlementsForProduct } from "./entitlements/entitlementUtils.js";
import { Decimal } from "decimal.js";

export const isProductUpgrade = ({
  prices1,
  prices2,
}: {
  prices1: Price[];
  prices2: Price[];
}) => {
  // if (product1.is_default) {
  //   return true;
  // } else if (product2.is_default) {
  //   return false;
  // }

  // 1. If biling interval is same:

  let billingInterval1 = getBillingInterval(prices1);
  let billingInterval2 = getBillingInterval(prices2);

  // 1. Get total price for each product
  const getTotalPrice = (prices: Price[]) => {
    // Get each product's price prorated to a year
    let totalPrice = new Decimal(0);
    for (const price of prices) {
      let interval = price.config?.interval;

      if (!interval || interval === BillingInterval.OneOff) {
        continue;
      }

      if ("usage_tiers" in price.config!) {
        // Just get total price for first tier
        totalPrice = totalPrice.plus(price.config!.usage_tiers[0].amount);
      } else {
        totalPrice = totalPrice.plus(price.config!.amount);
      }
    }
    return totalPrice.toNumber();
  };

  if (billingInterval1 == billingInterval2) {
    return getTotalPrice(prices1) < getTotalPrice(prices2);
  } else {
    return compareBillingIntervals(billingInterval1, billingInterval2) < 0;
  }
};

export const isSameBillingInterval = (
  product1: FullProduct,
  product2: FullProduct
) => {
  return (
    getBillingInterval(product1.prices) === getBillingInterval(product2.prices)
  );
};

export const isFreeProduct = (prices: Price[]) => {
  if (prices.length === 0) {
    return true;
  }

  let totalPrice = 0;
  for (const price of prices) {
    if ("usage_tiers" in price.config!) {
      totalPrice += price.config!.usage_tiers.reduce(
        (acc, tier) => acc + tier.amount,
        0
      );
    } else {
      totalPrice += price.config!.amount;
    }
  }
  return totalPrice === 0;
};

export const getOptionsFromPrices = (prices: Price[], features: Feature[]) => {
  const featureToOptions: { [key: string]: any } = {};
  for (const price of prices) {
    if (price.config!.type == PriceType.Fixed) {
      continue;
    }

    const config = price.config! as UsagePriceConfig;
    // get billing tyoe
    const billingType = getBillingType(price.config!);
    const feature = features.find(
      (f) => f.internal_id === config.internal_feature_id
    );

    if (!feature) {
      continue;
    }

    if (billingType === BillingType.UsageBelowThreshold) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          feature_name: feature.name,
          threshold: 0,
        };
      } else {
        featureToOptions[feature.id].threshold = 0;
      }
    } else if (billingType === BillingType.UsageInAdvance) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          feature_name: feature.name,
          quantity: 0,
        };
      }

      featureToOptions[feature.id].quantity = 0;
    }
  }

  return Object.values(featureToOptions);
};

export const checkStripeProductExists = async ({
  sb,
  org,
  env,
  product,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
}) => {
  let createNew = false;
  let stripeCli = createStripeCli({
    org,
    env,
  });

  if (!product.processor || !product.processor.id) {
    createNew = true;
  } else {
    try {
      await stripeCli.products.retrieve(product.processor!.id);
    } catch (error) {
      createNew = true;
    }
  }

  if (createNew) {
    console.log("Creating new product in Stripe");
    const stripeProduct = await stripeCli.products.create({
      name: product.name,
    });

    await ProductService.update({
      sb,
      internalId: product.internal_id,
      update: {
        processor: { id: stripeProduct.id, type: ProcessorType.Stripe },
      },
    });

    product.processor = {
      id: stripeProduct.id,
      type: ProcessorType.Stripe,
    };
  }
};

export const getPricesForProduct = (product: FullProduct, prices: Price[]) => {
  return prices.filter((p) => p.internal_product_id === product.internal_id);
};

export const attachToInsertParams = (
  attachParams: AttachParams,
  product: FullProduct
) => {
  return {
    ...attachParams,
    product,
    prices: getPricesForProduct(product, attachParams.prices),
    entitlements: getEntitlementsForProduct(product, attachParams.entitlements),
  } as InsertCusProductParams;
};
