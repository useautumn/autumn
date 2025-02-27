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
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
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
import { AttachParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import {
  applyTrialToEntitlement,
  getEntRelatedPrice,
} from "@/internal/products/entitlements/entitlementUtils.js";
import { getResetBalance } from "../entitlements/cusEntUtils.js";
import { sendSvixEvent } from "@/external/svix/svixUtils.js";
import { processFullCusProduct } from "../products/cusProductUtils.js";

export const initCusEntitlement = ({
  entitlement,
  customer,
  cusProductId,
  freeTrial,
  options,
  nextResetAt,
  billLaterOnly = false,
  relatedPrice,
}: {
  entitlement: EntitlementWithFeature;
  customer: Customer;
  cusProductId: string;
  freeTrial: FreeTrial | null;
  options?: FeatureOptions;
  nextResetAt?: number;
  billLaterOnly?: boolean;
  relatedPrice?: Price;
}) => {
  const resetBalance = getResetBalance({
    entitlement,
    options,
    relatedPrice,
  });

  // 2. Define reset interval (interval at which balance is reset to quantity * allowance)
  let reset_interval = entitlement.interval as EntInterval;
  let nextResetAtCalculated = null;
  let trialEndTimestamp = freeTrialToStripeTimestamp(freeTrial);

  // 2. If free trial applies, set next reset at to trial end timestamp
  if (
    freeTrial &&
    applyTrialToEntitlement(entitlement, freeTrial) &&
    trialEndTimestamp
  ) {
    nextResetAtCalculated = new Date(trialEndTimestamp! * 1000);
  }

  if (reset_interval && reset_interval != EntInterval.Lifetime) {
    nextResetAtCalculated = getNextEntitlementReset(
      nextResetAtCalculated,
      reset_interval
    ).getTime();
  }

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

  let nextResetNull =
    isBooleanFeature ||
    entitlement.allowance_type === AllowanceType.Unlimited ||
    entitlement.interval == EntInterval.Lifetime;

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
    balance: isBooleanFeature ? null : resetBalance,
    usage_allowed: usageAllowed,
    next_reset_at: nextResetNull ? null : nextResetAt || nextResetAtCalculated,
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
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
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

    const cusEnt: any = initCusEntitlement({
      entitlement,
      customer,
      cusProductId: cusProdId,
      options: options || undefined,
      nextResetAt,
      billLaterOnly,
      freeTrial: disableFreeTrial ? null : freeTrial,
      relatedPrice,
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
