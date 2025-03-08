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
} from "@autumn/shared";
import { generateId, nullish } from "@/utils/genUtils.js";
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
import {
  applyTrialToEntitlement,
  getEntRelatedPrice,
} from "@/internal/products/entitlements/entitlementUtils.js";
import { getResetBalance } from "../entitlements/cusEntUtils.js";
import { CusService } from "../CusService.js";
import { getExistingCusProducts } from "./handleExistingProduct.js";

const initCusEntBalance = ({
  entitlement,
  options,
  relatedPrice,
  existingCusEnt,
}: {
  entitlement: EntitlementWithFeature;
  options?: FeatureOptions;
  relatedPrice?: Price;
  existingCusEnt?: FullCustomerEntitlement;
}) => {
  if (entitlement.feature.type === FeatureType.Boolean) {
    return null;
  }

  const resetBalance = getResetBalance({
    entitlement,
    options,
    relatedPrice,
  });

  if (!existingCusEnt || !entitlement.carry_from_previous) {
    return resetBalance;
  }

  let existingAllowanceType = existingCusEnt.entitlement.allowance_type;
  if (
    nullish(existingCusEnt.balance) ||
    existingAllowanceType === AllowanceType.Unlimited
  ) {
    return resetBalance;
  }

  // Calculate existing usage
  let existingAllowance = existingCusEnt.entitlement.allowance!;
  let existingUsage = existingAllowance - existingCusEnt.balance!;

  let newBalance = resetBalance! - existingUsage;

  return newBalance;
};

const initCusEntNextResetAt = ({
  entitlement,
  nextResetAt,
  keepResetIntervals,
  existingCusEnt,
  freeTrial,
}: {
  entitlement: EntitlementWithFeature;
  nextResetAt?: number;
  keepResetIntervals?: boolean;
  existingCusEnt?: FullCustomerEntitlement;
  freeTrial: FreeTrial | null;
}) => {
  // 1. If entitlement is boolean, or unlimited, or lifetime, then next reset at is null
  if (
    entitlement.feature.type === FeatureType.Boolean ||
    entitlement.allowance_type === AllowanceType.Unlimited ||
    entitlement.interval == EntInterval.Lifetime
  ) {
    return null;
  }

  // 2. If nextResetAt (hardcoded), just return that...
  if (nextResetAt) {
    return nextResetAt;
  }

  // 3. If keepResetIntervals is true, return existing next reset at...
  if (keepResetIntervals && existingCusEnt?.next_reset_at) {
    return existingCusEnt.next_reset_at;
  }

  // 4. Calculate next reset at...
  let nextResetAtCalculated = null;
  let trialEndTimestamp = freeTrialToStripeTimestamp(freeTrial);
  if (
    freeTrial &&
    applyTrialToEntitlement(entitlement, freeTrial) &&
    trialEndTimestamp
  ) {
    nextResetAtCalculated = new Date(trialEndTimestamp! * 1000);
  }

  let resetInterval = entitlement.interval as EntInterval;
  nextResetAtCalculated = getNextEntitlementReset(
    nextResetAtCalculated,
    resetInterval
  ).getTime();

  return nextResetAtCalculated;
};

export const initCusEntitlement = ({
  entitlement,
  customer,
  cusProductId,
  freeTrial,
  options,
  nextResetAt,
  relatedPrice,
  existingCusEnt,
  keepResetIntervals = false,
}: {
  entitlement: EntitlementWithFeature;
  customer: Customer;
  cusProductId: string;
  freeTrial: FreeTrial | null;
  options?: FeatureOptions;
  nextResetAt?: number;
  relatedPrice?: Price;
  existingCusEnt?: FullCustomerEntitlement;
  keepResetIntervals?: boolean;
}) => {
  // const resetBalance = getResetBalance({
  //   entitlement,
  //   options,
  //   relatedPrice,
  // });

  let balance = initCusEntBalance({
    entitlement,
    options,
    relatedPrice,
    existingCusEnt,
  });

  let nextResetAtValue = initCusEntNextResetAt({
    entitlement,
    nextResetAt,
    keepResetIntervals,
    existingCusEnt,
    freeTrial,
  });

  // 3. Define expires at (TODO next time...)
  let isBooleanFeature = entitlement.feature.type === FeatureType.Boolean;
  let usageAllowed = false;

  if (
    relatedPrice &&
    (getBillingType(relatedPrice.config!) === BillingType.UsageInArrear ||
      getBillingType(relatedPrice.config!) === BillingType.InArrearProrated)
  ) {
    usageAllowed = true;
  }

  // Calculate balance...

  return {
    id: generateId("cus_ent"),
    internal_customer_id: customer.internal_id,
    internal_feature_id: entitlement.internal_feature_id,
    feature_id: entitlement.feature_id,
    customer_id: customer.id,

    // Foreign keys
    entitlement_id: entitlement.id,
    customer_product_id: cusProductId,
    created_at: Date.now(),

    // Entitlement fields
    unlimited: isBooleanFeature
      ? null
      : entitlement.allowance_type === AllowanceType.Unlimited,
    balance: isBooleanFeature ? null : balance,
    usage_allowed: usageAllowed,
    next_reset_at: nextResetAtValue,
  };
};

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
  org,
  env,
  sb,
  customer,
  startsAt,
  productGroup,
}: {
  org: Organization;
  env: AppEnv;
  sb: SupabaseClient;
  customer: Customer;
  startsAt?: number;
  productGroup: string;
}) => {
  // 1. If startsAt
  if (startsAt && startsAt > Date.now()) {
    await CusProductService.deleteFutureProduct({
      sb,
      internalCustomerId: customer.internal_id,
      productGroup,
      org,
      env,
    });
  } else {
    await CusProductService.expireCurrentProduct({
      sb,
      internalCustomerId: customer.internal_id,
      productGroup,
    });
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
  collectionMethod = CollectionMethod.ChargeAutomatically,
  subscriptionIds = [],
  subscriptionScheduleIds = [],

  keepResetIntervals = false,
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
  collectionMethod?: CollectionMethod;
  subscriptionIds?: string[];
  subscriptionScheduleIds?: string[];
  keepResetIntervals?: boolean;
}) => {
  const {
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    freeTrial,
    org,
  } = attachParams;

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

  if (!product.is_add_on) {
    await expireOrDeleteCusProduct({
      sb,
      customer,
      startsAt,
      productGroup: product.group,
      org,
      env: customer.env,
    });
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
    collectionMethod,
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

  return cusProd;
};
