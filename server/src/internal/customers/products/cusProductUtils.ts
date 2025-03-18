import {
  AppEnv,
  CusProductSchema,
  CusProductStatus,
  Customer,
  FixedPriceConfig,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
  PriceType,
  UsagePriceConfig,
} from "@autumn/shared";
import { getPriceOptions, getUsageTier } from "@/internal/prices/priceUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { ProductService } from "@/internal/products/ProductService.js";
import { CusProductService } from "./CusProductService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import Stripe from "stripe";
import {
  deleteScheduledIds,
  subIsPrematurelyCanceled,
} from "@/external/stripe/stripeSubUtils.js";
import { sortCusEntsForDeduction } from "../entitlements/cusEntUtils.js";

// 1. Delete future product
export const uncancelCurrentProduct = async ({
  sb,
  curCusProduct,
  org,
  env,
  internalCustomerId,
  productGroup,
}: {
  sb: SupabaseClient;
  curCusProduct?: FullCusProduct;
  org: Organization;
  internalCustomerId: string;
  productGroup: string;
  env: AppEnv;
}) => {
  if (!curCusProduct) {
    curCusProduct = await CusProductService.getCurrentProductByGroup({
      sb,
      internalCustomerId: internalCustomerId,
      productGroup: productGroup,
    });
  }

  const stripeCli = createStripeCli({
    org,
    env,
  });

  if (
    curCusProduct &&
    curCusProduct.subscription_ids &&
    curCusProduct.subscription_ids.length > 0
  ) {
    const uncancelSub = async (subId: string) => {
      await stripeCli.subscriptions.update(subId, {
        cancel_at: null,
      });
    };

    let subIds = curCusProduct.subscription_ids;
    if (subIds && subIds.length > 0) {
      const batchUncancel = [];
      for (const subId of subIds) {
        batchUncancel.push(uncancelSub(subId));
      }
      await Promise.all(batchUncancel);
    }
  }
};

// 1. Cancel cusProductSubscriptions
export const cancelCusProductSubscriptions = async ({
  sb,
  cusProduct,
  org,
  env,
  excludeIds,
}: {
  sb: SupabaseClient;
  cusProduct: FullCusProduct;
  org: Organization;
  env: AppEnv;
  excludeIds?: string[];
}) => {
  // 1. Cancel all subscriptions
  const stripeCli = createStripeCli({
    org: org,
    env: env,
  });

  const cancelStripeSub = async (subId: string) => {
    if (excludeIds && excludeIds.includes(subId)) {
      return;
    }

    try {
      await stripeCli.subscriptions.cancel(subId);
      console.log(
        `Cancelled stripe subscription ${subId}, org: ${org.slug}, product: ${cusProduct.product.name}, customer: ${cusProduct.customer.id}`
      );
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

export const activateDefaultProduct = async ({
  productGroup,
  orgId,
  customer,
  org,
  sb,
  env,
  curCusProduct,
}: {
  productGroup: string;
  orgId: string;
  customer: Customer;
  org: Organization;
  sb: SupabaseClient;
  env: AppEnv;
  curCusProduct?: FullCusProduct;
}) => {
  // 1. Expire current product
  const defaultProducts = await ProductService.getFullDefaultProducts({
    sb,
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
    sb,
    attachParams: {
      org,
      customer,
      product: defaultProd,
      prices: defaultProd.prices,
      entitlements: defaultProd.entitlements,
      freeTrial: defaultProd.free_trial,
      optionsList: [],
    },
  });

  console.log(`   ✅ activated default product: ${defaultProd.group}`);
  return true;
};

export const expireAndActivate = async ({
  sb,
  env,
  cusProduct,
  org,
}: {
  sb: SupabaseClient;
  env: AppEnv;
  cusProduct: FullCusProduct;
  org: Organization;
}) => {
  // 1. Expire current product
  await CusProductService.update({
    sb,
    cusProductId: cusProduct.id,
    updates: { status: CusProductStatus.Expired, ended_at: Date.now() },
  });

  await activateDefaultProduct({
    productGroup: cusProduct.product.group,
    orgId: org.id,
    customer: cusProduct.customer,
    org,
    sb,
    env,
  });
};

export const activateFutureProduct = async ({
  sb,
  cusProduct,
  subscription,
  org,
  env,
}: {
  sb: SupabaseClient;
  cusProduct: FullCusProduct;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({
    org,
    env,
  });

  const futureProduct = await CusProductService.getFutureProduct({
    sb,
    internalCustomerId: cusProduct.internal_customer_id,
    productGroup: cusProduct.product.group,
  });

  if (!futureProduct) {
    return false;
  }

  if (subIsPrematurelyCanceled(subscription)) {
    console.log(
      "   🔔 Subscription prematurely canceled, deleting scheduled products"
    );

    await deleteScheduledIds({
      stripeCli,
      scheduledIds: futureProduct.scheduled_ids,
    });
    await CusProductService.delete({
      sb,
      cusProductId: futureProduct.id,
    });
    return false;
  } else {
    await CusProductService.update({
      sb,
      cusProductId: futureProduct.id,
      updates: { status: CusProductStatus.Active },
    });
    return true;
  }
};

// OTHERS
export const fullCusProductToCusEnts = (
  cusProducts: FullCusProduct[],
  inStatuses: CusProductStatus[] = [CusProductStatus.Active]
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
      }))
    );
  }

  sortCusEntsForDeduction(cusEnts);

  return cusEnts;
};

export const fullCusProductToCusPrices = (
  cusProducts: FullCusProduct[],
  inStatuses: CusProductStatus[] = [CusProductStatus.Active]
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

export const processFullCusProduct = (cusProduct: FullCusProduct) => {
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

      return {
        amount: usageTier.amount,
        interval: config.interval,
        quantity: priceOptions?.quantity,
      };
    }
  });
  const trialing =
    cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();
  return {
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
    // prices: cusProduct.customer_prices,
    // entitlements: cusProduct.customer_entitlements,
  };
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
  cusProducts,
  status,
}: {
  productId: string;
  cusProducts: FullCusProduct[];
  status?: CusProductStatus;
}) => {
  if (!cusProducts) {
    return undefined;
  }
  return cusProducts.find(
    (cusProduct: FullCusProduct) =>
      cusProduct.product.id === productId &&
      (status ? cusProduct.status === status : true)
  );
};
