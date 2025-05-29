import {
  APIVersion,
  AppEnv,
  AttachScenario,
  CusProductResponseSchema,
  CusProductSchema,
  CusProductStatus,
  Customer,
  Entity,
  FixedPriceConfig,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
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
import { SupabaseClient } from "@supabase/supabase-js";
import { ProductService } from "@/internal/products/ProductService.js";
import { CusProductService } from "./CusProductService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import Stripe from "stripe";
import {
  deleteScheduledIds,
  getStripeSubs,
  subIsPrematurelyCanceled,
} from "@/external/stripe/stripeSubUtils.js";
import { sortCusEntsForDeduction } from "../entitlements/cusEntUtils.js";
import { getRelatedCusEnt } from "../prices/cusPriceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

export const isActiveStatus = (status: CusProductStatus) => {
  return (
    status === CusProductStatus.Active || status === CusProductStatus.PastDue
  );
};

// 1. Cancel cusProductSubscriptions
export const cancelCusProductSubscriptions = async ({
  cusProduct,
  org,
  env,
  excludeIds,
  expireImmediately = true,
}: {
  cusProduct: FullCusProduct;
  org: Organization;
  env: AppEnv;
  excludeIds?: string[];
  expireImmediately?: boolean;
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

    latestSubEnd = stripeSubs[0].current_period_end;
  }

  const cancelStripeSub = async (subId: string) => {
    if (excludeIds && excludeIds.includes(subId)) {
      return;
    }

    try {
      if (expireImmediately) {
        await stripeCli.subscriptions.cancel(subId);
      } else {
        await stripeCli.subscriptions.update(subId, {
          cancel_at: latestSubEnd || undefined,
          cancel_at_period_end: latestSubEnd ? undefined : true,
        });
      }

      console.log(
        `Cancelled stripe subscription ${subId}, org: ${org.slug}, product: ${cusProduct.product.name}, customer: ${cusProduct.customer!.id}`,
      );
    } catch (error: any) {
      if (error.code != "resource_missing") {
        console.log(
          `Error canceling stripe subscription ${error.code}: ${error.message}`,
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

export const activateDefaultProduct = async ({
  db,
  productGroup,
  customer,
  org,
  env,
  curCusProduct,
}: {
  db: DrizzleCli;
  productGroup: string;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  curCusProduct?: FullCusProduct;
}) => {
  // 1. Expire current product
  const defaultProducts = await ProductService.listDefault({
    db,
    orgId: org.id,
    env,
  });

  const defaultProd = defaultProducts.find((p) => p.group === productGroup);

  if (!defaultProd) {
    return false;
  }

  if (
    curCusProduct &&
    curCusProduct.internal_product_id == defaultProd.internal_id
  ) {
    console.log("   ❌ default product is already active");
    return false;
  }

  await createFullCusProduct({
    db,
    attachParams: {
      org,
      customer,
      product: defaultProd,
      prices: defaultProd.prices,
      entitlements: defaultProd.entitlements,
      freeTrial: defaultProd.free_trial || null,
      optionsList: [],
      entities: [],
      features: [],
    },
    scenario: AttachScenario.New,
  });

  console.log(`   ✅ activated default product: ${defaultProd.group}`);
  return true;
};

export const expireAndActivate = async ({
  db,
  env,
  cusProduct,
  org,
}: {
  db: DrizzleCli;
  env: AppEnv;
  cusProduct: FullCusProduct;
  org: Organization;
}) => {
  // 1. Expire current product
  await CusProductService.update({
    db,
    cusProductId: cusProduct.id,
    updates: { status: CusProductStatus.Expired, ended_at: Date.now() },
  });

  await activateDefaultProduct({
    db,
    productGroup: cusProduct.product.group,
    customer: cusProduct.customer!,
    org,
    env,
  });
};

export const activateFutureProduct = async ({
  req,
  db,
  cusProduct,
  subscription,
  org,
  env,
  logger = console,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  cusProduct: FullCusProduct;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  const stripeCli = createStripeCli({
    org,
    env,
  });

  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId: cusProduct.internal_customer_id,
    inStatuses: [CusProductStatus.Scheduled],
  });

  let { curScheduledProduct: futureProduct } = await getExistingCusProducts({
    product: cusProduct.product,
    cusProducts,
  });

  if (!futureProduct) {
    return false;
  }

  if (subIsPrematurelyCanceled(subscription)) {
    console.log(
      "   🔔 Subscription prematurely canceled, deleting scheduled products",
    );

    await deleteScheduledIds({
      stripeCli,
      scheduledIds: futureProduct.scheduled_ids || [],
    });
    await CusProductService.delete({
      db,
      cusProductId: futureProduct.id,
    });
    return false;
  } else {
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

    return true;
  }
};

// GET CUS ENTS FROM CUS PRODUCTS
export const fullCusProductToCusEnts = (
  cusProducts: FullCusProduct[],
  inStatuses: CusProductStatus[] = [CusProductStatus.Active],
  reverseOrder: boolean = false,
) => {
  const cusEnts: FullCustomerEntitlement[] = [];

  for (const cusProduct of cusProducts) {
    if (!inStatuses.includes(cusProduct.status)) {
      continue;
    }

    cusEnts.push(
      ...cusProduct.customer_entitlements.map((cusEnt) => ({
        ...cusEnt,
        customer_product: CusProductSchema.parse(cusProduct),
      })),
    );
  }

  sortCusEntsForDeduction(cusEnts, reverseOrder);

  return cusEnts;
};

export const fullCusProductToCusPrices = (
  cusProducts: FullCusProduct[],
  inStatuses: CusProductStatus[] = [CusProductStatus.Active],
) => {
  const cusPrices: FullCustomerPrice[] = [];

  for (const cusProduct of cusProducts) {
    if (!inStatuses.includes(cusProduct.status)) {
      continue;
    }

    cusPrices.push(...cusProduct.customer_prices);
  }

  return cusPrices;
};

export const processFullCusProduct = ({
  cusProduct,
  subs,
  org,
  entities = [],
  apiVersion,
}: {
  cusProduct: FullCusProduct;
  org: Organization;
  subs?: (Stripe.Subscription | Subscription)[];
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
      (s) => s.id == subIds[0] || (s as Subscription).stripe_id == subIds[0],
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

      stripe_subscription_ids: cusProduct.subscription_ids || [],
      started_at: cusProduct.starts_at,
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

export const isTrialing = (cusProduct: FullCusProduct) => {
  return cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();
};

export const getMainCusProduct = async ({
  db,
  internalCustomerId,
}: {
  db: DrizzleCli;
  internalCustomerId: string;
}) => {
  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId,
    inStatuses: [
      CusProductStatus.Active,
      CusProductStatus.PastDue,
      CusProductStatus.Scheduled,
    ],
  });

  let mainCusProduct = cusProducts.find(
    (cusProduct: FullCusProduct) => !cusProduct.product.is_add_on,
  );

  return mainCusProduct;
};
