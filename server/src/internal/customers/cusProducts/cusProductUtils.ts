import {
  APIVersion,
  AppEnv,
  AttachScenario,
  CusProductResponseSchema,
  CusProductStatus,
  Customer,
  Entity,
  FixedPriceConfig,
  FullCusProduct,
  FullCustomer,
  Organization,
  PriceType,
  Subscription,
  TierInfinite,
  UsagePriceConfig,
} from "@autumn/shared";
import {
  getPriceOptions,
  getUsageTier,
} from "@/internal/products/prices/priceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { CusProductService, RELEVANT_STATUSES } from "./CusProductService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import Stripe from "stripe";
import {
  deleteScheduledIds,
  getStripeSubs,
  subIsPrematurelyCanceled,
} from "@/external/stripe/stripeSubUtils.js";
import { getRelatedCusEnt } from "./cusPrices/cusPriceUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getExistingCusProducts } from "./cusProductUtils/getExistingCusProducts.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { cusProductToPrices } from "@autumn/shared";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { initStripeCusAndProducts } from "../handlers/handleCreateCustomer.js";
import { handleAddProduct } from "../attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { newCusToAttachParams } from "../attach/attachUtils/attachParams/convertToParams.js";
import { getDefaultAttachConfig } from "../attach/attachUtils/getAttachConfig.js";

// 1. Cancel cusProductSubscriptions
// CAN DELETE
export const cancelCusProductSubscriptions = async ({
  cusProduct,
  org,
  env,
  excludeIds,
  expireImmediately = true,
  logger,
  prorate = true,
}: {
  cusProduct: FullCusProduct;
  org: Organization;
  env: AppEnv;
  excludeIds?: string[];
  expireImmediately?: boolean;
  logger: any;
  prorate?: boolean;
}) => {
  // 1. Cancel all subscriptions
  const stripeCli = createStripeCli({
    org: org,
    env: env,
  });

  let latestSubEnd: number | undefined;
  if (cusProduct.subscription_ids && cusProduct.subscription_ids.length > 0) {
    let stripeSubs = await getStripeSubs({
      stripeCli,
      subIds: cusProduct.subscription_ids,
    });

    latestSubEnd = stripeSubs?.[0]?.items.data[0].current_period_end;
  }

  const cancelStripeSub = async (subId: string) => {
    if (excludeIds && excludeIds.includes(subId)) {
      return;
    }

    try {
      if (expireImmediately) {
        await stripeCli.subscriptions.cancel(subId, {
          prorate: prorate,
        });
      } else {
        await stripeCli.subscriptions.update(subId, {
          cancel_at: latestSubEnd || undefined,
          cancel_at_period_end: latestSubEnd ? undefined : true,
        });
      }

      logger.info(`Cancelled stripe subscription ${subId}, org: ${org.slug}`);
    } catch (error: any) {
      if (error.code != "resource_missing") {
        console.log(
          `Error canceling stripe subscription ${error.code}: ${error.message}`
        );
      } // else subscription probably already cancelled
    }
  };

  if (cusProduct.subscription_ids && cusProduct.subscription_ids.length > 0) {
    const batchCancel = [];
    for (const subId of cusProduct.subscription_ids) {
      batchCancel.push(cancelStripeSub(subId));
    }
    await Promise.all(batchCancel);
    return true;
  }

  return false;
};

export const getDefaultProduct = async ({
  req,
  productGroup,
}: {
  req: ExtendedRequest;
  productGroup: string;
}) => {
  const { db, org, env, logger } = req;
  const defaultProducts = await ProductService.listDefault({
    db,
    orgId: org.id,
    env,
  });

  let defaultProd = defaultProducts.find(
    (p) =>
      p.group === productGroup && !isDefaultTrialFullProduct({ product: p })
  );

  return defaultProd;
};

export const activateDefaultProduct = async ({
  req,
  productGroup,
  fullCus,
  curCusProduct,
}: {
  req: ExtendedRequest;
  productGroup: string;
  fullCus: FullCustomer;
  curCusProduct?: FullCusProduct;
}) => {
  const { db, org, env, logger } = req;
  // 1. Expire current product
  const defaultProducts = await ProductService.listDefault({
    db,
    orgId: org.id,
    env,
  });

  // Look for a paid default trial first, then fall back to free default
  let defaultProd = defaultProducts.find(
    (p) => p.group === productGroup && isDefaultTrialFullProduct({ product: p })
  );

  let defaultableProducts = {
    free: defaultProducts.filter(
      (p) => p.group === productGroup && isFreeProduct(p.prices)
    ),
    paid: defaultProducts.filter(
      (p) =>
        p.group === productGroup && isDefaultTrialFullProduct({ product: p })
    ),
  };

  // console.log("Found defaultable products:", {
  // 	free: defaultableProducts.free.map((p) => p.name),
  // 	paid: defaultableProducts.paid.map((p) => p.name),
  // });

  if (defaultableProducts.paid.length > 0) {
    defaultProd = defaultableProducts.paid[0];
  } else if (defaultableProducts.free.length > 0) {
    defaultProd = defaultableProducts.free[0];
  } else {
    return false;
  }

  if (curCusProduct?.internal_product_id == defaultProd.internal_id) {
    return false;
  }

  const stripeCli = createStripeCli({ org, env });
  let defaultIsFree = isFreeProduct(defaultProd.prices);
  let isDefaultTrial = isDefaultTrialFullProduct({ product: defaultProd });

  // Initialize Stripe customer and products if needed (for paid non-trial products)
  if (!defaultIsFree && !isDefaultTrial) {
    await initStripeCusAndProducts({
      db,
      org,
      env,
      customer: fullCus,
      products: [defaultProd],
      logger,
    });
  }

  if (!isDefaultTrial) {
    const existingDefaultProduct = fullCus.customer_products.find(
      (cp) =>
        cp.product.internal_id === defaultProd!.internal_id &&
        (cp.status === CusProductStatus.Active ||
          cp.status === CusProductStatus.PastDue ||
          cp.status === CusProductStatus.Trialing)
    );

    if (existingDefaultProduct) {
      logger.info(
        `Default product ${defaultProd!.name} already exists for customer`
      );
      return false;
    }

    await handleAddProduct({
      req,
      attachParams: newCusToAttachParams({
        req,
        newCus: fullCus,
        products: [defaultProd],
        stripeCli,
      }),
    });

    // await createFullCusProduct({
    //   db,
    //   attachParams: {
    //     org,
    //     customer,
    //     product: defaultProd,
    //     prices: defaultProd.prices,
    //     entitlements: defaultProd.entitlements,
    //     freeTrial: defaultProd.free_trial || null,
    //     optionsList: [],
    //     entities: [],
    //     features: [],
    //     replaceables: [],
    //   },
    //   scenario: AttachScenario.New,
    //   logger,
    // });

    // console.log(`   ✅ activated default product: ${defaultProd.group}`);
    return true;
  } else if (isDefaultTrial && defaultableProducts.free.length > 0) {
    defaultProd = defaultableProducts.free[0];

    // Check if the free default product already exists to prevent duplicates
    const existingFreeProduct = fullCus.customer_products.find(
      (cp) =>
        cp.product.internal_id === defaultProd!.internal_id &&
        (cp.status === CusProductStatus.Active ||
          cp.status === CusProductStatus.PastDue)
    );

    if (existingFreeProduct) {
      logger.info(
        `Free default product ${defaultProd!.name} already exists for customer`
      );
      return false;
    }

    await handleAddProduct({
      req,
      attachParams: newCusToAttachParams({
        req,
        newCus: fullCus,
        products: [defaultProd],
        stripeCli,
      }),
      config: getDefaultAttachConfig(),
    });

    return true;
  }
};

export const expireAndActivate = async ({
  req,
  cusProduct,
  fullCus,
}: {
  req: ExtendedRequest;
  cusProduct: FullCusProduct;
  fullCus: FullCustomer;
}) => {
  const { db, org, env, logger } = req;
  // 1. Expire current product
  await CusProductService.update({
    db,
    cusProductId: cusProduct.id,
    updates: { status: CusProductStatus.Expired, ended_at: Date.now() },
  });

  // Check if it's one time product
  let prices = cusProductToPrices({ cusProduct });
  let product = cusProduct.product;
  const isOneOffOrAddOn = product.is_add_on || isOneOff(prices);

  if (isOneOffOrAddOn || notNullish(cusProduct.internal_entity_id)) {
    return;
  }

  await activateDefaultProduct({
    req,
    productGroup: cusProduct.product.group,
    fullCus,
  });
};

export const activateFutureProduct = async ({
  req,
  cusProduct,
}: {
  req: ExtendedRequest;
  cusProduct: FullCusProduct;
}) => {
  const { db, org, env, logger } = req;

  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId: cusProduct.internal_customer_id,
    inStatuses: [CusProductStatus.Scheduled],
  });

  let { curScheduledProduct: futureProduct } = getExistingCusProducts({
    product: cusProduct.product,
    cusProducts,
    internalEntityId: cusProduct.internal_entity_id,
  });

  if (!futureProduct) {
    return false;
  }

  await CusProductService.update({
    db,
    cusProductId: futureProduct.id,
    updates: { status: CusProductStatus.Active },
  });

  await addProductsUpdatedWebhookTask({
    req,
    internalCustomerId: cusProduct.internal_customer_id,
    org,
    env,
    customerId: null,
    scenario: AttachScenario.New,
    cusProduct: futureProduct,
    logger,
  });

  return futureProduct;

  // if (subIsPrematurelyCanceled(subscription)) {
  //   console.log(
  //     "   🔔 Subscription prematurely canceled, deleting scheduled products"
  //   );

  //   await deleteScheduledIds({
  //     stripeCli,
  //     scheduledIds: futureProduct.scheduled_ids || [],
  //   });
  //   await CusProductService.delete({
  //     db,
  //     cusProductId: futureProduct.id,
  //   });
  //   return false;
  // } else {
  //   await CusProductService.update({
  //     db,
  //     cusProductId: futureProduct.id,
  //     updates: { status: CusProductStatus.Active },
  //   });

  //   await addProductsUpdatedWebhookTask({
  //     req,
  //     internalCustomerId: cusProduct.internal_customer_id,
  //     org,
  //     env,
  //     customerId: null,
  //     scenario: AttachScenario.New,
  //     cusProduct: futureProduct,
  //     logger,
  //   });

  //   return true;
  // }
};

// GET CUS ENTS FROM CUS PRODUCTS

export const processFullCusProduct = ({
  cusProduct,
  subs,
  org,
  entities = [],
  apiVersion,
}: {
  cusProduct: FullCusProduct;
  org: Organization;
  subs?: Subscription[];
  entities?: Entity[];
  apiVersion: number;
}) => {
  // Process prices

  const prices = cusProduct.customer_prices.map((cp) => {
    let price = cp.price;

    if (price.config?.type == PriceType.Fixed) {
      let config = price.config as FixedPriceConfig;
      return {
        amount: config.amount,
        interval: config.interval,
      };
    } else {
      let config = price.config as UsagePriceConfig;
      let priceOptions = getPriceOptions(price, cusProduct.options);
      let usageTier = getUsageTier(price, priceOptions?.quantity!);
      let cusEnt = getRelatedCusEnt({
        cusPrice: cp,
        cusEnts: cusProduct.customer_entitlements,
      });

      let ent = cusEnt?.entitlement;

      let singleTier = ent?.allowance == 0 && config.usage_tiers.length == 1;

      if (singleTier) {
        return {
          amount: usageTier.amount,
          interval: config.interval,
          quantity: priceOptions?.quantity,
        };
      } else {
        // Add allowance to tiers
        let allowance = ent?.allowance;
        let tiers;

        if (notNullish(allowance) && allowance! > 0) {
          tiers = [
            {
              to: allowance,
              amount: 0,
            },
            ...config.usage_tiers.map((tier) => {
              let isLastTier = tier.to == -1 || tier.to == TierInfinite;
              return {
                to: isLastTier ? tier.to : Number(tier.to) + allowance!,
                amount: tier.amount,
              };
            }),
          ];
        } else {
          tiers = config.usage_tiers.map((tier) => {
            let isLastTier = tier.to == -1 || tier.to == TierInfinite;
            return {
              to: isLastTier ? tier.to : Number(tier.to) + allowance!,
              amount: tier.amount,
            };
          });
        }

        return {
          tiers: tiers,
          name: "",
          quantity: priceOptions?.quantity,
        };
      }
    }
  });

  const trialing =
    cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();

  const subIds = cusProduct.subscription_ids;
  let stripeSubData = {};

  if (
    subIds &&
    subIds.length > 0 &&
    org.config.api_version >= BREAK_API_VERSION
  ) {
    let baseSub = subs?.find(
      (s) => s.id == subIds[0] || (s as Subscription).stripe_id == subIds[0]
    );
    stripeSubData = {
      current_period_end: baseSub?.current_period_end
        ? baseSub.current_period_end * 1000
        : null,
      current_period_start: baseSub?.current_period_start
        ? baseSub.current_period_start * 1000
        : null,
    };
  }

  if (!subIds && trialing) {
    stripeSubData = {
      current_period_start: cusProduct.starts_at,
      current_period_end: cusProduct.trial_ends_at,
    };
  }

  if (apiVersion >= APIVersion.v1_1) {
    if ((!subIds || subIds.length == 0) && trialing) {
      stripeSubData = {
        current_period_start: cusProduct.starts_at,
        current_period_end: cusProduct.trial_ends_at,
      };
    }

    return CusProductResponseSchema.parse({
      id: cusProduct.product.id,
      name: cusProduct.product.name,
      group: cusProduct.product.group || null,
      status: trialing ? CusProductStatus.Trialing : cusProduct.status,
      // created_at: cusProduct.created_at,
      canceled_at: cusProduct.canceled_at,
      is_default: cusProduct.product.is_default || false,
      is_add_on: cusProduct.product.is_add_on || false,

      stripe_subscription_ids: cusProduct.subscription_ids || [],
      started_at: cusProduct.starts_at,
      // entity_id: cusProduct.entity_id,
      entity_id: cusProduct.internal_entity_id
        ? entities?.find((e) => e.internal_id == cusProduct.internal_entity_id)
            ?.id
        : cusProduct.entity_id || undefined,

      ...stripeSubData,
    });
  } else {
    let cusProductResponse = {
      id: cusProduct.product.id,
      name: cusProduct.product.name,
      group: cusProduct.product.group,
      status: trialing ? CusProductStatus.Trialing : cusProduct.status,
      created_at: cusProduct.created_at,
      canceled_at: cusProduct.canceled_at,
      processor: {
        type: cusProduct.processor?.type,
        subscription_id: cusProduct.processor?.subscription_id || null,
      },
      subscription_ids: cusProduct.subscription_ids || [],
      prices: prices,
      starts_at: cusProduct.starts_at,

      ...stripeSubData,
      // prices: cusProduct.customer_prices,
      // entitlements: cusProduct.customer_entitlements,
    };

    return cusProductResponse;
  }
};

// GET CUSTOMER PRODUCT & ORG IN PARALLEL
export const fullCusProductToProduct = (cusProduct: FullCusProduct) => {
  return {
    ...cusProduct.product,
    prices: cusProduct.customer_prices.map((cp) => cp.price),
    entitlements: cusProduct.customer_entitlements.map((ce) => ce.entitlement),
  };
};

export const searchCusProducts = ({
  productId,
  internalProductId,
  cusProducts,
  status,
}: {
  productId?: string;
  internalProductId?: string;
  cusProducts: FullCusProduct[];
  status?: CusProductStatus;
}) => {
  if (!cusProducts) {
    return undefined;
  }
  return cusProducts.find((cusProduct: FullCusProduct) => {
    let prodIdMatch = false;
    if (productId) {
      prodIdMatch = cusProduct.product.id === productId;
    } else if (internalProductId) {
      prodIdMatch = cusProduct.product.internal_id === internalProductId;
    }
    return prodIdMatch && (status ? cusProduct.status === status : true);
  });
};

export const getMainCusProduct = async ({
  db,
  internalCustomerId,
  productGroup,
}: {
  db: DrizzleCli;
  internalCustomerId: string;
  productGroup?: string;
}) => {
  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId,
    inStatuses: RELEVANT_STATUSES,
  });

  let mainCusProduct = cusProducts.find(
    (cusProduct: FullCusProduct) =>
      !cusProduct.product.is_add_on &&
      (productGroup ? cusProduct.product.group === productGroup : true)
  );

  return mainCusProduct as FullCusProduct;
};

export const getCusProductsWithStripeSubId = ({
  cusProducts,
  stripeSubId,
  curCusProductId,
}: {
  cusProducts: FullCusProduct[];
  stripeSubId: string;
  curCusProductId?: string;
}) => {
  return cusProducts.filter(
    (cusProduct) =>
      cusProduct.subscription_ids?.includes(stripeSubId) &&
      cusProduct.id !== curCusProductId
  );
};

export const getFeatureQuantity = ({
  cusProduct,
  internalFeatureId,
}: {
  cusProduct: FullCusProduct;
  internalFeatureId: string;
}) => {
  const options = cusProduct.options;
  const option = options.find(
    (o) => o.internal_feature_id == internalFeatureId
  );
  return nullish(option?.quantity) ? 1 : option?.quantity!;
};
