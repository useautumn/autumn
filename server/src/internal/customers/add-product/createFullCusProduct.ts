import {
  CusProductStatus,
  Price,
  ProcessorType,
  CustomerEntitlement,
  CusProduct,
  FeatureOptions,
  FreeTrial,
  CollectionMethod,
  FullCusProduct,
  LoggerAction,
} from "@autumn/shared";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";

import { Customer } from "@autumn/shared";
import { FullProduct } from "@autumn/shared";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { CustomerPrice } from "@autumn/shared";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { InsertCusProductParams } from "../cusProducts/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";

import { getExistingCusProducts } from "../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { searchCusProducts } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { updateOneTimeCusProduct } from "./createOneTimeCusProduct.js";
import { initCusEntitlement } from "./initCusEnt.js";
import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "../cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "../cusProducts/cusPrices/CusPriceService.js";
import { addExistingUsagesToCusEnts } from "../cusProducts/cusEnts/cusEntUtils/getExistingUsage.js";

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
  isCustom,
  entityId,
  internalEntityId,
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
  isCustom?: boolean;
  entityId?: string;
  internalEntityId?: string;
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
    is_custom: isCustom || false,
    quantity: 1,
    internal_entity_id: internalEntityId,
    entity_id: entityId,
  };
};

export const insertFullCusProduct = async ({
  db,
  cusProd,
  cusEnts,
  cusPrices,
}: {
  db: DrizzleCli;
  cusProd: CusProduct;
  cusEnts: CustomerEntitlement[];
  cusPrices: CustomerPrice[];
}) => {
  await CusProductService.insert({
    db,
    data: cusProd,
  });

  await CusEntService.insert({
    db,
    data: cusEnts,
  });

  await CusPriceService.insert({
    db,
    data: cusPrices,
  });
};

export const expireOrDeleteCusProduct = async ({
  db,
  startsAt,
  product,
  cusProducts,
  internalEntityId,
}: {
  db: DrizzleCli;
  startsAt?: number;
  product: FullProduct;
  cusProducts?: FullCusProduct[];
  internalEntityId?: string;
}) => {
  // 1. If startsAt
  if (startsAt && startsAt > Date.now()) {
    let curScheduledProduct = cusProducts?.find(
      (cp) =>
        cp.product.group === product.group &&
        cp.status === CusProductStatus.Scheduled &&
        (internalEntityId
          ? cp.internal_entity_id === internalEntityId
          : nullish(cp.internal_entity_id)),
    );

    if (curScheduledProduct) {
      await CusProductService.delete({
        db,
        cusProductId: curScheduledProduct.id,
      });
    }
  } else {
    let { curMainProduct } = getExistingCusProducts({
      product,
      cusProducts: cusProducts as FullCusProduct[],
      internalEntityId,
    });

    if (curMainProduct) {
      await CusProductService.update({
        db,
        cusProductId: curMainProduct.id,
        updates: {
          status: CusProductStatus.Expired,
        },
      });
    }
  }
};

export const getExistingCusProduct = async ({
  db,
  cusProducts,
  product,
  internalCustomerId,
  internalEntityId,
}: {
  db: DrizzleCli;

  cusProducts?: FullCusProduct[];
  product: FullProduct;
  internalCustomerId: string;
  internalEntityId?: string;
}) => {
  if (!cusProducts) {
    cusProducts = await CusProductService.list({
      db,
      internalCustomerId,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
    });
  }

  const { curMainProduct } = getExistingCusProducts({
    product,
    cusProducts: cusProducts as FullCusProduct[],
    internalEntityId,
  });

  return curMainProduct;
};

export const createFullCusProduct = async ({
  db,
  attachParams,
  startsAt,
  subscriptionId,
  nextResetAt,
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
  carryExistingUsages = false,
  carryOverTrial = false,
  isDowngrade = false,
  scenario = "default",
  sendWebhook = true,
}: {
  db: DrizzleCli;
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
  carryExistingUsages?: boolean;
  carryOverTrial?: boolean;
  isDowngrade?: boolean;
  scenario?: string;
  sendWebhook?: boolean;
}) => {
  disableFreeTrial = attachParams.disableFreeTrial || disableFreeTrial;

  const logger = createLogtailWithContext({
    action: LoggerAction.CreateFullCusProduct,
    org_slug: attachParams.org.slug,
    org_id: attachParams.org.id,
    attachParams,
  });

  let { customer, product, prices, entitlements, optionsList, freeTrial, org } =
    attachParams;

  // 1. If one off

  // Try to get current cus product or set to null...
  let curCusProduct;
  try {
    curCusProduct = await getExistingCusProduct({
      db,
      cusProducts: attachParams.cusProducts,
      product,
      internalCustomerId: customer.internal_id,
      internalEntityId: attachParams.internalEntityId,
    });
  } catch (error) {}

  const existingCusProduct = searchCusProducts({
    // productId: product.id,
    internalProductId: product.internal_id,
    cusProducts: attachParams.cusProducts!,
    status: CusProductStatus.Active,
  });

  if (
    (isOneOff(prices) || (isFreeProduct(prices) && product.is_add_on)) &&
    notNullish(existingCusProduct) &&
    !attachParams.isCustom
  ) {
    await updateOneTimeCusProduct({
      db,
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

    const cusEnt: any = initCusEntitlement({
      entitlement,
      customer,
      cusProductId: cusProdId,
      options: options || undefined,
      nextResetAt,
      freeTrial: disableFreeTrial ? null : freeTrial,
      relatedPrice,
      // existingCusEnt,
      keepResetIntervals,
      anchorToUnix,
      entities: attachParams.entities || [],
      carryExistingUsages,
      curCusProduct: curCusProduct as FullCusProduct,
    });

    cusEnts.push(cusEnt);
  }

  // Perform deductions on new cus ents...

  let deductedCusEnts = addExistingUsagesToCusEnts({
    cusEnts: cusEnts,
    entitlements: entitlements,
    curCusProduct: curCusProduct as FullCusProduct,
    carryExistingUsages,
    isDowngrade,
    entities: attachParams.entities,
    features: attachParams.features,
  });

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
  if (carryOverTrial && curCusProduct?.free_trial_id) {
    freeTrial = curCusProduct.free_trial || null;
    trialEndsAt = curCusProduct.trial_ends_at || null;
  }

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
    isCustom: attachParams.isCustom || false,
    entityId: attachParams.entityId,
    internalEntityId: attachParams.internalEntityId,
  });

  // Expire previous product if not one off
  if (!isOneOff(prices) && !product.is_add_on) {
    await expireOrDeleteCusProduct({
      db,
      startsAt,
      product,
      cusProducts: attachParams.cusProducts,
      internalEntityId: attachParams.internalEntityId,
    });
  }

  await insertFullCusProduct({
    db,
    cusProd,
    cusEnts: deductedCusEnts,
    cusPrices,
  });

  let fullCusProduct = {
    ...cusProd,
    product,
    customer_entitlements: cusEnts.map((ce) => ({
      ...ce,
      entitlement: entitlements.find((e) => e.id === ce.entitlement_id)!,
    })),
    customer_prices: cusPrices.map((cp) => ({
      ...cp,
      price: prices.find((p) => p.id === cp.price_id)!,
    })),
  };

  try {
    if (sendWebhook && !attachParams.fromMigration) {
      // Maybe send two for downgrade? (one for scheduled, one for active)
      await addProductsUpdatedWebhookTask({
        req: attachParams.req,
        internalCustomerId: customer.internal_id,
        org,
        env: customer.env,
        customerId: customer.id || null,
        cusProduct: isDowngrade ? curCusProduct! : fullCusProduct,
        scheduledCusProduct: isDowngrade ? fullCusProduct : undefined,
        scenario,
        logger,
      });
    }
  } catch (error) {
    logger.error("Failed to add products updated webhook task to queue");
  }

  return fullCusProduct;
};
