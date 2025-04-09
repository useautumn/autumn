import {
  AppEnv,
  BillingInterval,
  BillingType,
  CreateProduct,
  Entitlement,
  EntitlementSchema,
  EntitlementWithFeature,
  ErrCode,
  Feature,
  FixedPriceConfig,
  Organization,
  Price,
  PriceSchema,
  PriceType,
  ProcessorType,
  Product,
  ProductSchema,
  UsagePriceConfig,
} from "@autumn/shared";
import { FullProduct } from "@autumn/shared";
import {
  compareBillingIntervals,
  getBillingInterval,
  getBillingType,
  pricesAreSame,
} from "@/internal/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { ProductService } from "./ProductService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  AttachParams,
  InsertCusProductParams,
} from "../customers/products/AttachParams.js";
import {
  entsAreSame,
  getEntitlementsForProduct,
} from "./entitlements/entitlementUtils.js";
import { Decimal } from "decimal.js";
import { generateId } from "@/utils/genUtils.js";
import { PriceService } from "../prices/PriceService.js";
import { EntitlementService } from "./entitlements/EntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";
import { createStripePriceIFNotExist } from "@/external/stripe/stripePriceUtils.js";
import { FreeTrialService } from "./free-trials/FreeTrialService.js";
import { freeTrialsAreSame } from "./free-trials/freeTrialUtils.js";

export const getLatestProducts = (products: FullProduct[]) => {
  const latestProducts = products.reduce((acc: any, product: any) => {
    if (!acc[product.id]) {
      acc[product.id] = product;
    } else if (product.version > acc[product.id].version) {
      acc[product.id] = product;
    }
    return acc;
  }, {});

  return Object.values(latestProducts) as FullProduct[];
};

export const getProductVersionCounts = (products: FullProduct[]) => {
  const versionCounts = products.reduce((acc: any, product: any) => {
    if (!acc[product.id]) {
      acc[product.id] = 1;
    } else {
      acc[product.id]++;
    }
    return acc;
  }, {});

  return versionCounts;
};

// Construct product
export const constructProduct = ({
  productData,
  orgId,
  env,
  processor,
}: {
  productData: CreateProduct;
  orgId: string;
  env: AppEnv;
  processor?: any;
}) => {
  let newProduct: Product = {
    ...productData,
    org_id: orgId,
    env,
    processor,
    internal_id: generateId("prod"),
    created_at: Date.now(),
  };

  return newProduct;
};

export const isProductUpgrade = ({
  prices1,
  prices2,
}: {
  prices1: Price[];
  prices2: Price[];
}) => {
  if (isFreeProduct(prices1) && !isFreeProduct(prices2)) {
    return true;
  }

  if (!isFreeProduct(prices1) && isFreeProduct(prices2)) {
    return false;
  }

  if (
    prices1.every(
      (p) => getBillingType(p.config!) === BillingType.UsageInArrear
    ) &&
    prices2.every(
      (p) => getBillingType(p.config!) === BillingType.UsageInArrear
    )
  ) {
    return true;
  }

  let billingInterval1 = getBillingInterval(prices1);
  let billingInterval2 = getBillingInterval(prices2);

  // 2. Get total price for each product
  const getTotalPrice = (prices: Price[]) => {
    // Get each product's price prorated to a year
    let totalPrice = new Decimal(0);
    for (const price of prices) {
      // let interval = price.config?.interval;

      // if (!interval || interval === BillingInterval.OneOff) {
      //   continue;
      // }

      if ("usage_tiers" in price.config!) {
        // Just get total price for first tier
        totalPrice = totalPrice.plus(price.config!.usage_tiers[0].amount);
      } else {
        totalPrice = totalPrice.plus(price.config!.amount);
      }
    }
    return totalPrice.toNumber();
  };

  // 3. Compare prices
  if (billingInterval1 == billingInterval2) {
    return getTotalPrice(prices1) < getTotalPrice(prices2);
  } else {
    // If billing interval is different, compare the billing intervals
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
  logger,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  logger: any;
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
      let stripeProduct = await stripeCli.products.retrieve(
        product.processor!.id
      );
      if (!stripeProduct.active) {
        createNew = true;
      }
    } catch (error) {
      createNew = true;
    }
  }

  if (createNew) {
    logger.info(`Creating new product in Stripe for ${product.name}`);
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

// COPY PRODUCT
export const copyProduct = async ({
  sb,
  product,
  toOrgId,
  toId,
  toName,
  toEnv,
  features,
}: {
  sb: SupabaseClient;
  product: FullProduct;
  toOrgId: string;
  toEnv: AppEnv;
  toId: string;
  toName: string;
  features: Feature[];
}) => {
  const newProduct = {
    ...product,
    name: toName,
    id: toId,
    internal_id: generateId("prod"),
    org_id: toOrgId,
    env: toEnv,
    processor: null,
  };

  let newPrices: Price[] = [];
  for (const price of product.prices) {
    // 1. Copy price
    let newPrice = structuredClone(price);

    let config = newPrice.config as UsagePriceConfig;

    // Clear Stripe IDs
    config.stripe_meter_id = undefined;
    config.stripe_product_id = undefined;
    config.stripe_placeholder_price_id = undefined;
    config.stripe_price_id = undefined;

    if (config.type === PriceType.Usage) {
      let feature = features.find((f) => f.id === config.feature_id);
      if (!feature) {
        throw new RecaseError({
          message: `Feature ${config.feature_id} not found`,
          code: ErrCode.FeatureNotFound,
          statusCode: 404,
        });
      }

      config.internal_feature_id = feature.internal_id!;
      config.feature_id = feature.id;
    }

    newPrices.push(
      PriceSchema.parse({
        ...newPrice,
        id: generateId("pr"),
        created_at: Date.now(),
        org_id: toOrgId,
        internal_product_id: newProduct.internal_id,
        config: config,
      })
    );
  }

  const newEntitlements: Entitlement[] = [];
  for (const entitlement of product.entitlements) {
    let feature = features.find((f) => f.id === entitlement.feature_id);
    if (!feature) {
      throw new RecaseError({
        message: `Feature ${entitlement.feature_id} not found`,
        code: ErrCode.FeatureNotFound,
        statusCode: 404,
      });
    }

    newEntitlements.push(
      EntitlementSchema.parse({
        ...entitlement,
        id: generateId("ent"),
        org_id: toOrgId,
        created_at: Date.now(),
        internal_product_id: newProduct.internal_id,
        internal_feature_id: feature.internal_id,
      })
    );
  }

  await ProductService.create({
    sb,
    product: ProductSchema.parse(newProduct),
  });

  await Promise.all([
    PriceService.insert({
      sb,
      data: newPrices,
    }),

    EntitlementService.insert({
      sb,
      data: newEntitlements,
    }),
  ]);
  if (product.free_trial) {
    await FreeTrialService.insert({
      sb,
      data: {
        ...product.free_trial,
        id: generateId("ft"),
        created_at: Date.now(),
        internal_product_id: newProduct.internal_id,
      },
    });
  }
};

export const isOneOff = (prices: Price[]) => {
  return (
    prices.every((p) => p.config?.interval === BillingInterval.OneOff) &&
    prices.some((p) => {
      if (p.config?.type === PriceType.Usage) {
        let config = p.config as UsagePriceConfig;
        return config.usage_tiers.some((t) => t.amount > 0);
      } else {
        let config = p.config as FixedPriceConfig;
        return config.amount > 0;
      }
    })
  );
};

export const initProductInStripe = async ({
  sb,
  org,
  env,
  logger,
  product,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  logger: any;
  product: FullProduct;
}) => {
  // 1.
  await checkStripeProductExists({
    sb,
    org,
    env,
    product,
    logger,
  });

  const batchPriceUpdate = [];
  const stripeCli = await createStripeCli({
    org,
    env,
  });
  for (const price of product.prices) {
    batchPriceUpdate.push(
      createStripePriceIFNotExist({
        sb,
        org,
        stripeCli,
        price,
        entitlements: product.entitlements,
        product: product,
        logger,
      })
    );
  }

  await Promise.all(batchPriceUpdate);
};

export const searchProductsByStripeId = async ({
  products,
  stripeId,
}: {
  products: FullProduct[];
  stripeId: string;
}) => {
  return products.find((p) => p.processor?.id === stripeId);
};

// PRODUCT CHANGES
export const productsAreDifferent = ({
  product1,
  product2,
}: {
  product1: FullProduct;
  product2: FullProduct;
}) => {
  // console.log("product1", product1);
  // console.log("product2", product2);
  for (const price of product1.prices) {
    let newPrice = product2.prices.find((p) => p.id === price.id);
    if (!newPrice) {
      return true;
    }

    if (!pricesAreSame(price, newPrice)) {
      return true;
    }
  }

  for (const price of product2.prices) {
    let newPrice = product1.prices.find((p) => p.id === price.id);
    if (!newPrice) {
      return true;
    }

    if (!pricesAreSame(price, newPrice)) {
      return true;
    }
  }

  for (const entitlement of product1.entitlements) {
    let newEntitlement = product2.entitlements.find(
      (e) => e.id === entitlement.id
    );
    if (!newEntitlement) {
      return true;
    }

    if (!entsAreSame(entitlement, newEntitlement)) {
      return true;
    }
  }

  for (const entitlement of product2.entitlements) {
    let newEntitlement = product1.entitlements.find(
      (e) => e.id === entitlement.id
    );
    if (!newEntitlement) {
      return true;
    }

    if (!entsAreSame(entitlement, newEntitlement)) {
      return true;
    }
  }

  if (!freeTrialsAreSame(product1.free_trial, product2.free_trial)) {
    return true;
  }

  return false;
};
