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
  APIVersion,
  InsertReplaceable,
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
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "../cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "../cusProducts/cusPrices/CusPriceService.js";
import { addExistingUsagesToCusEnts } from "../cusProducts/cusEnts/cusEntUtils/getExistingUsage.js";
import { RepService } from "../cusProducts/cusEnts/RepService.js";
import { getNewProductRollovers } from "../cusProducts/cusEnts/cusRollovers/getNewProductRollovers.js";
import { RolloverService } from "../cusProducts/cusEnts/cusRollovers/RolloverService.js";

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
  // subscriptionId,
  // subscriptionScheduleId,
  // lastInvoiceId,
  cusProdId,
  startsAt,
  optionsList,
  freeTrial,
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
  apiVersion,
}: {
  customer: Customer;
  product: FullProduct;
  // subscriptionId: string | undefined | null;
  // subscriptionScheduleId?: string | null;
  // lastInvoiceId?: string | null;
  cusProdId: string;
  startsAt?: number;
  optionsList: FeatureOptions[];
  freeTrial: FreeTrial | null;
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
  apiVersion?: APIVersion;
}) => {
  let isFuture = startsAt && startsAt > Date.now();

  let trialEnds = trialEndsAt;
  if (!trialEndsAt && freeTrial) {
    trialEnds = freeTrialToStripeTimestamp({ freeTrial })! * 1000;
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
      // subscription_id: subscriptionId,
      // subscription_schedule_id: subscriptionScheduleId,
      // last_invoice_id: lastInvoiceId,
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
    api_version: apiVersion,
  };
};

export const insertFullCusProduct = async ({
  db,
  cusProd,
  cusEnts,
  cusPrices,
  replaceables,
}: {
  db: DrizzleCli;
  cusProd: CusProduct;
  cusEnts: CustomerEntitlement[];
  cusPrices: CustomerPrice[];
  replaceables: InsertReplaceable[];
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

  await RepService.insert({
    db,
    data: replaceables,
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
          : nullish(cp.internal_entity_id))
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
  // subscriptionId,
  nextResetAt,
  disableFreeTrial = false,
  lastInvoiceId = null,
  trialEndsAt,
  subscriptionStatus,
  canceledAt = null,
  createdAt = null,
  subscriptionIds = [],
  subscriptionScheduleIds = [],
  // keepResetIntervals = false,
  anchorToUnix,
  carryExistingUsages = false,
  carryOverTrial = false,
  isDowngrade = false,
  scenario = "default",
  sendWebhook = true,
  logger,
}: {
  db: DrizzleCli;
  attachParams: InsertCusProductParams;
  startsAt?: number;
  // subscriptionId?: string;
  nextResetAt?: number;
  billLaterOnly?: boolean;
  disableFreeTrial?: boolean;
  lastInvoiceId?: string | null;
  trialEndsAt?: number;
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
  logger: any;
}) => {
  disableFreeTrial = attachParams.disableFreeTrial || disableFreeTrial;

  let { customer, product, prices, entitlements, optionsList, org, freeTrial } =
    attachParams;

  // Try to get current cus product or set to null...
  let curCusProduct = await getExistingCusProduct({
    db,
    cusProducts: attachParams.cusProducts,
    product,
    internalCustomerId: customer.internal_id,
    internalEntityId: attachParams.internalEntityId,
  });

  freeTrial = disableFreeTrial ? null : freeTrial;

  if (carryOverTrial && curCusProduct?.free_trial) {
    freeTrial = curCusProduct.free_trial;
    trialEndsAt = curCusProduct.trial_ends_at || undefined;
  }

  let attachReplaceables = attachParams.replaceables || [];

  const existingCusProduct = searchCusProducts({
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
  logger.info(
    `Inserting cus product ${product.id} for ${customer.name}, cus product ID: ${cusProdId}`
  );

  // 1. create customer entitlements
  const cusEnts: CustomerEntitlement[] = [];
  const newReplaceables: InsertReplaceable[] = [];

  for (const entitlement of entitlements) {
    const options = getEntOptions(optionsList, entitlement);
    const relatedPrice = getEntRelatedPrice(entitlement, prices);

    const cusEnt: any = initCusEntitlement({
      entitlement,
      customer,
      cusProductId: cusProdId,
      options: options || undefined,
      nextResetAt,
      freeTrial,
      relatedPrice,
      // existingCusEnt,
      // keepResetIntervals,
      trialEndsAt,
      anchorToUnix,
      entities: attachParams.entities || [],
      carryExistingUsages,
      curCusProduct: curCusProduct as FullCusProduct,
      replaceables: attachReplaceables,
      now: attachParams.now,
    });

    cusEnts.push(cusEnt);

    let newReplaceables_ = attachReplaceables
      .filter((r) => r.ent.id === entitlement.id)
      .map((r) => ({
        ...r,
        cus_ent_id: cusEnt.id,
      }));

    newReplaceables.push(...newReplaceables_);
  }

  // 3. Deduct existing usages
  let deductedCusEnts = addExistingUsagesToCusEnts({
    cusEnts: cusEnts,
    entitlements: entitlements,
    curCusProduct: curCusProduct as FullCusProduct,
    carryExistingUsages,
    isDowngrade,
    entities: attachParams.entities,
    features: attachParams.features,
  });

  // 4. Get new rollovers
  let rolloverOps = await getNewProductRollovers({
    db,
    curCusProduct: curCusProduct as FullCusProduct,
    cusEnts,
    entitlements,
    logger,
  });

  // 4. create customer prices
  const cusPrices: CustomerPrice[] = [];

  for (const price of prices) {
    const cusPrice: CustomerPrice = initCusPrice({
      price,
      customer,
      cusProductId: cusProdId,
    });

    cusPrices.push(cusPrice);
  }

  // let entityId = customer.entity?.id;
  const cusProd = initCusProduct({
    cusProdId,
    customer,
    product,
    startsAt,
    optionsList,
    freeTrial: disableFreeTrial ? null : freeTrial,
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
    internalEntityId: attachParams.internalEntityId,
    entityId: attachParams.entityId,
    apiVersion: attachParams.apiVersion,
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
    replaceables: newReplaceables,
  });

  let rolloverInserts: any = [];

  for (const operation of rolloverOps) {
    rolloverInserts.push(
      RolloverService.insert({
        db,
        rows: operation.toInsert,
        fullCusEnt: operation.cusEnt,
      })
    );
  }

  let finalRollovers = (await Promise.all(rolloverInserts)).flatMap((r) => r);

  // Get rollovers for each entitlement
  const cusEntsWithRollovers = await Promise.all(
    cusEnts.map(async (ce) => ({
      ...ce,
      entitlement: entitlements.find((e) => e.id === ce.entitlement_id)!,
      replaceables: newReplaceables
        .filter((r) => r.cus_ent_id === ce.id)
        .map((r) => ({
          ...r,
          delete_next_cycle: r.delete_next_cycle || false,
        })),
      rollovers: finalRollovers.filter((r) => r.cus_ent_id === ce.id),
      // await RolloverService.getCurrentRollovers({
      //   db,
      //   cusEntID: ce.id,
      // }),
    }))
  );

  let fullCusProduct = {
    ...cusProd,
    product,
    customer_entitlements: cusEntsWithRollovers,
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
