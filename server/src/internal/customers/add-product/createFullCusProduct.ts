import {
  AllowanceType,
  CusProductStatus,
  Price,
  ProcessorType,
  EntInterval,
  CustomerEntitlement,
  CusProduct,
  FeatureOptions,
  FreeTrial,
  BillingType,
  CollectionMethod,
  Organization,
  AppEnv,
  FullCusProduct,
  FullCustomerEntitlement,
  LoggerAction,
} from "@autumn/shared";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import { Customer, FeatureType } from "@autumn/shared";
import { EntitlementWithFeature, FullProduct } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import RecaseError from "@/utils/errorUtils.js";
import { getBillingType, getEntOptions } from "@/internal/prices/priceUtils.js";
import { CustomerPrice } from "@autumn/shared";
import { CusProductService } from "../products/CusProductService.js";
import { InsertCusProductParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";
import { CusService } from "../CusService.js";
import { getExistingCusProducts } from "./handleExistingProduct.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import { searchCusProducts } from "@/internal/customers/products/cusProductUtils.js";
import { updateOneTimeCusProduct } from "./createOneTimeCusProduct.js";
import { initCusEntitlement } from "./initCusEnt.js";
import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
export const initCusPrice = ({
  price,
  customer,
  cusProductId,
}: {
  price: Price;
  customer: Customer;
  cusProductId: string;
}) => {
  const cusPrice: CustomerPrice = {
    id: generateId("cus_price"),
    internal_customer_id: customer.internal_id,
    customer_product_id: cusProductId,
    created_at: Date.now(),

    price_id: price.id || null,
  };

  return cusPrice;
};

export const initCusProduct = ({
  customer,
  product,
  subscriptionId,
  cusProdId,
  startsAt,
  subscriptionScheduleId,
  optionsList,
  freeTrial,
  lastInvoiceId,
  trialEndsAt,
  subscriptionStatus,
  canceledAt,
  createdAt,
  collectionMethod,
  subscriptionIds,
  subscriptionScheduleIds,
}: {
  customer: Customer;
  product: FullProduct;
  subscriptionId: string | undefined | null;
  cusProdId: string;
  startsAt?: number;
  subscriptionScheduleId?: string | null;
  optionsList: FeatureOptions[];
  freeTrial: FreeTrial | null;
  lastInvoiceId?: string | null;
  trialEndsAt?: number | null;
  subscriptionStatus?: CusProductStatus;
  canceledAt?: number | null;
  createdAt?: number | null;
  collectionMethod?: CollectionMethod;
  subscriptionIds?: string[];
  subscriptionScheduleIds?: string[];
}) => {
  let isFuture = startsAt && startsAt > Date.now();

  let trialEnds = trialEndsAt;
  if (!trialEndsAt && freeTrial) {
    trialEnds = freeTrialToStripeTimestamp(freeTrial)! * 1000;
  }

  return {
    id: cusProdId,
    internal_customer_id: customer.internal_id,
    customer_id: customer.id,
    internal_product_id: product.internal_id,
    product_id: product.id,
    created_at: createdAt || Date.now(),

    status: subscriptionStatus
      ? subscriptionStatus
      : isFuture
      ? CusProductStatus.Scheduled
      : CusProductStatus.Active,

    processor: {
      type: ProcessorType.Stripe,
      subscription_id: subscriptionId,
      subscription_schedule_id: subscriptionScheduleId,
      last_invoice_id: lastInvoiceId,
    },

    starts_at: startsAt || Date.now(),
    trial_ends_at: trialEnds,
    options: optionsList || [],
    free_trial_id: freeTrial?.id || null,
    canceled_at: canceledAt,
    collection_method: collectionMethod || CollectionMethod.ChargeAutomatically,
    subscription_ids: subscriptionIds,
    scheduled_ids: subscriptionScheduleIds,
  };
};

export const insertFullCusProduct = async ({
  sb,
  cusProd,
  cusEnts,
  cusPrices,
}: {
  sb: SupabaseClient;
  cusProd: CusProduct;
  cusEnts: CustomerEntitlement[];
  cusPrices: CustomerPrice[];
}) => {
  const { error: prodError } = await sb
    .from("customer_products")
    .insert(cusProd);

  if (prodError) {
    console.log("Error inserting customer product: ", prodError);
    throw new RecaseError({
      message: "Error inserting customer product",
      code: ErrCode.InternalError,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }

  const { error: entError } = await sb
    .from("customer_entitlements")
    .insert(cusEnts);
  if (entError) {
    console.log("Error inserting customer entitlements: ", entError);
    throw new RecaseError({
      message: "Error inserting customer entitlements",
      code: ErrCode.InternalError,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }

  const { error: priceError } = await sb
    .from("customer_prices")
    .insert(cusPrices);

  if (priceError) {
    console.log("Error inserting customer prices: ", priceError);
    throw new RecaseError({
      message: "Error inserting customer prices",
      code: ErrCode.InternalError,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export const expireOrDeleteCusProduct = async ({
  sb,
  startsAt,
  product,
  cusProducts,
}: {
  sb: SupabaseClient;
  startsAt?: number;
  product: FullProduct;
  cusProducts?: FullCusProduct[];
}) => {
  // 1. If startsAt
  if (startsAt && startsAt > Date.now()) {
    let curScheduledProduct = cusProducts?.find(
      (cp) =>
        cp.product.group === product.group &&
        cp.status === CusProductStatus.Scheduled
    );

    if (curScheduledProduct) {
      await CusProductService.delete({
        sb,
        cusProductId: curScheduledProduct.id,
      });
    }
  } else {
    let { curMainProduct } = await getExistingCusProducts({
      product,
      cusProducts: cusProducts as FullCusProduct[],
    });

    if (curMainProduct) {
      await CusProductService.update({
        sb,
        cusProductId: curMainProduct.id,
        updates: {
          status: CusProductStatus.Expired,
        },
      });
    }
  }
};

export const getExistingCusProduct = async ({
  sb,
  cusProducts,
  product,
  internalCustomerId,
}: {
  sb: SupabaseClient;
  cusProducts?: FullCusProduct[];
  product: FullProduct;
  internalCustomerId: string;
}) => {
  if (!cusProducts) {
    cusProducts = await CusService.getFullCusProducts({
      sb,
      internalCustomerId,
    });
  }

  const { curMainProduct } = await getExistingCusProducts({
    product,
    cusProducts: cusProducts as FullCusProduct[],
  });

  return curMainProduct;
};

export const createFullCusProduct = async ({
  sb,
  attachParams,
  startsAt,
  subscriptionId,
  nextResetAt,
  billLaterOnly = false,
  disableFreeTrial = false,
  lastInvoiceId = null,
  trialEndsAt = null,
  subscriptionStatus,
  canceledAt = null,
  createdAt = null,
  subscriptionIds = [],
  subscriptionScheduleIds = [],
  keepResetIntervals = false,
  anchorToUnix,
}: {
  sb: SupabaseClient;
  attachParams: InsertCusProductParams;

  startsAt?: number;
  subscriptionId?: string;
  nextResetAt?: number;
  billLaterOnly?: boolean;
  disableFreeTrial?: boolean;
  lastInvoiceId?: string | null;
  trialEndsAt?: number | null;
  subscriptionStatus?: CusProductStatus;
  canceledAt?: number | null;
  createdAt?: number | null;
  subscriptionIds?: string[];
  subscriptionScheduleIds?: string[];
  keepResetIntervals?: boolean;
  anchorToUnix?: number;
}) => {
  const logger = createLogtailWithContext({
    action: LoggerAction.CreateFullCusProduct,
    org_slug: attachParams.org.slug,
    org_id: attachParams.org.id,
    attachParams,
  });

  const {
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    freeTrial,
    org,
  } = attachParams;

  // 1. If one off

  // Try to get current cus product or set to null...
  let curCusProduct;
  try {
    curCusProduct = await getExistingCusProduct({
      sb,
      cusProducts: attachParams.cusProducts,
      product,
      internalCustomerId: customer.internal_id,
    });
  } catch (error) {}

  if (!isOneOff(prices) && !product.is_add_on) {
    await expireOrDeleteCusProduct({
      sb,
      startsAt,
      product,
      cusProducts: attachParams.cusProducts,
    });
  }

  const existingCusProduct = searchCusProducts({
    productId: product.id,
    cusProducts: attachParams.cusProducts!,
    status: CusProductStatus.Active,
  });

  if (isOneOff(prices) && notNullish(existingCusProduct)) {
    await updateOneTimeCusProduct({
      sb,
      attachParams,
      logger,
    });
    return;
  }

  const cusProdId = generateId("cus_prod");

  // 1. create customer entitlements
  const cusEnts: CustomerEntitlement[] = [];

  for (const entitlement of entitlements) {
    const options = getEntOptions(optionsList, entitlement);
    const relatedPrice = getEntRelatedPrice(entitlement, prices);
    const existingCusEnt = curCusProduct?.customer_entitlements.find(
      (ce) => ce.internal_feature_id === entitlement.internal_feature_id
    );

    // Update existing entitlement if one off
    const cusEnt: any = initCusEntitlement({
      entitlement,
      customer,
      cusProductId: cusProdId,
      options: options || undefined,
      nextResetAt,
      freeTrial: disableFreeTrial ? null : freeTrial,
      relatedPrice,
      existingCusEnt,
      keepResetIntervals,
      anchorToUnix,
      entities: attachParams.entities || [],
    });

    cusEnts.push(cusEnt);
  }

  // 2. create customer prices
  const cusPrices: CustomerPrice[] = [];
  for (const price of prices) {
    const cusPrice: CustomerPrice = initCusPrice({
      price,
      customer,
      cusProductId: cusProdId,
    });

    cusPrices.push(cusPrice);
  }

  // 3. create customer product
  const cusProd = initCusProduct({
    cusProdId,
    customer,
    product,
    subscriptionId,
    startsAt,
    optionsList,
    freeTrial: disableFreeTrial ? null : freeTrial,
    lastInvoiceId,
    trialEndsAt,
    subscriptionStatus,
    canceledAt,
    createdAt,
    collectionMethod: attachParams.invoiceOnly
      ? CollectionMethod.SendInvoice
      : CollectionMethod.ChargeAutomatically,
    subscriptionIds,
    subscriptionScheduleIds,
  });

  await insertFullCusProduct({
    sb,
    cusProd,
    cusEnts,
    cusPrices,
  });

  // // Send webhook
  // await sendSvixEvent({
  //   org: customer.org,
  //   eventType: "product.attached",
  //   data: processFullCusProduct({
  //     customer,
  //     product,
  //     prices,
  //     entitlements,
  //     optionsList,
  //   }),
  // });

  return {
    ...cusProd,
    customer_entitlements: cusEnts.map((ce) => ({
      ...ce,
      entitlement: entitlements.find((e) => e.id === ce.entitlement_id),
    })),
    customer_prices: cusPrices.map((cp) => ({
      ...cp,
      price: prices.find((p) => p.id === cp.price_id),
    })),
  };
};
