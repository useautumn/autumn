import {
  AppEnv,
  BillingInterval,
  BillingType,
  CreateProduct,
  Entitlement,
  EntitlementSchema,
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
  getBillingInterval,
  getBillingType,
} from "@/internal/products/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { ProductService } from "./ProductService.js";
import {
  AttachParams,
  InsertCusProductParams,
} from "../customers/cusProducts/AttachParams.js";
import {
  getEntitlementsForProduct,
  getEntsWithFeature,
} from "./entitlements/entitlementUtils.js";
import { Decimal } from "decimal.js";
import { generateId } from "@/utils/genUtils.js";
import { PriceService } from "./prices/PriceService.js";
import { EntitlementService } from "./entitlements/EntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { FreeTrialService } from "./free-trials/FreeTrialService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { compareBillingIntervals } from "./prices/priceUtils/priceIntervalUtils.js";
import { isStripeConnected } from "../orgs/orgUtils.js";

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
    base_variant_id: null,
  };

  return newProduct;
};

export const isProductUpgrade = ({
  prices1,
  prices2,
  usageAlwaysUpgrade = true,
}: {
  prices1: Price[];
  prices2: Price[];
  usageAlwaysUpgrade?: boolean;
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
    ) &&
    usageAlwaysUpgrade
  ) {
    return true;
  }

  let billingInterval1 = getBillingInterval(prices1);
  let billingInterval2 = getBillingInterval(prices2);

  // 2. Get total price for each product
  const getTotalPrice = (prices: Price[]) => {
    let totalPrice = new Decimal(0);
    for (const price of prices) {
      if ("usage_tiers" in price.config!) {
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
    return compareBillingIntervals(billingInterval1, billingInterval2) > 0;
  }
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

    if (billingType === BillingType.UsageInAdvance) {
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
  db,
  org,
  env,
  product,
  logger,
}: {
  db: DrizzleCli;
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

    await ProductService.updateByInternalId({
      db,
      internalId: product.internal_id,
      update: {
        processor: { id: stripeProduct.id, type: ProcessorType.Stripe },
      },
    });

    console.log(
      `Updated product ${product.name} with stripe product ${stripeProduct.id}`
    );

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
  db,
  product,
  toOrgId,
  toId,
  toName,
  fromEnv,
  toEnv,
  toFeatures,
  fromFeatures,
  org,
  logger,
}: {
  db: DrizzleCli;
  product: FullProduct;
  toOrgId: string;
  fromEnv: AppEnv;
  toEnv: AppEnv;
  toId: string;
  toName: string;
  toFeatures: Feature[];
  fromFeatures: Feature[];
  org: Organization;
  logger: any;
}) => {
  const newProduct = {
    ...product,
    name: toName,
    id: toId,
    internal_id: generateId("prod"),
    org_id: toOrgId,
    env: toEnv,
    processor: null,
    base_variant_id: fromEnv == toEnv ? null : product.base_variant_id,
  };

  const newEntitlements: Entitlement[] = [];
  const newEntIds: Record<string, string> = {};

  for (const entitlement of product.entitlements) {
    // 1. Get from feature
    let fromFeature = fromFeatures.find(
      (f) => f.internal_id === entitlement.internal_feature_id
    );

    // 2. Get to feature
    let toFeature = toFeatures.find((f) => f.id === fromFeature?.id);

    if (!toFeature) {
      throw new RecaseError({
        message: `Feature ${entitlement.feature_id} not found`,
        code: ErrCode.FeatureNotFound,
        statusCode: 404,
      });
    }

    let newId = generateId("ent");
    newEntitlements.push(
      EntitlementSchema.parse({
        ...entitlement,
        id: newId,
        org_id: toOrgId,
        created_at: Date.now(),
        internal_product_id: newProduct.internal_id,
        internal_feature_id: toFeature.internal_id,
      })
    );

    newEntIds[entitlement.id!] = newId;
  }

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
      let fromFeature = fromFeatures.find(
        (f) => f.internal_id === config.internal_feature_id
      );

      let toFeature = toFeatures.find((f) => f.id === fromFeature?.id);

      if (!toFeature) {
        throw new RecaseError({
          message: `Feature ${config.feature_id} not found`,
          code: ErrCode.FeatureNotFound,
          statusCode: 404,
        });
      }

      config.internal_feature_id = toFeature.internal_id!;
      config.feature_id = toFeature.id;

      // Update entitlement id
      let entitlementId = newEntIds[price.entitlement_id!];
      if (!entitlementId) {
        throw new RecaseError({
          message: `Failed to swap entitlement id for price ${price.id}`,
          code: ErrCode.InternalError,
          statusCode: 500,
        });
      }
      newPrice.entitlement_id = entitlementId;
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

  await ProductService.insert({
    db,
    product: {
      ...ProductSchema.parse(newProduct),
      version: 1,
    },
  });

  await EntitlementService.insert({
    db,
    data: newEntitlements,
  });

  await PriceService.insert({
    db,
    data: newPrices,
  });

  if (product.free_trial) {
    await FreeTrialService.insert({
      db,
      data: {
        ...product.free_trial,
        id: generateId("ft"),
        created_at: Date.now(),
        internal_product_id: newProduct.internal_id,
      },
    });
  }

  await initProductInStripe({
    db,
    org,
    env: toEnv,
    logger,
    product: {
      ...newProduct,
      prices: newPrices,
      entitlements: getEntsWithFeature({
        ents: newEntitlements,
        features: toFeatures,
      }),
    },
  });
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
  db,
  org,
  env,
  logger,
  product,
}: {
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  logger: any;
  product: FullProduct;
}) => {
  if (!isStripeConnected({ org, env })) return;

  await checkStripeProductExists({
    db,
    org,
    env,
    product,
    logger,
  });

  const batchPriceUpdate = [];
  const stripeCli = createStripeCli({
    org,
    env,
  });
  for (const price of product.prices) {
    batchPriceUpdate.push(
      createStripePriceIFNotExist({
        db,
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
