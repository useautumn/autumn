import Stripe from "stripe";
import { stripeToAutumnSubStatus } from "@/external/stripe/stripeSubUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { constructSub } from "@/internal/subscriptions/subUtils.js";
import {
  FullCustomer,
  FullProduct,
  Price,
  EntitlementWithFeature,
  CusProductStatus,
  UsagePriceConfig,
  BillingInterval,
} from "@autumn/shared";

import { notNullish } from "../genUtils.js";
import { ExtendedRequest } from "../models/Request.js";
import { isUsagePrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import { prices as priceTable } from "@autumn/shared";
import { PriceService } from "@/internal/products/prices/PriceService.js";

export const addProductFromSubs = async ({
  req,
  autumnCus,
  autumnProduct,
  stripeSubs,
  prices,
  entitlements,
  force = false,
  isCustom = false,
  anchorToUnix,
}: {
  req: ExtendedRequest;
  autumnCus: FullCustomer;
  autumnProduct: FullProduct;
  stripeSubs: Stripe.Subscription[];
  prices?: Price[];
  entitlements?: EntitlementWithFeature[];
  force?: boolean;
  isCustom?: boolean;
  anchorToUnix?: number;
}) => {
  const { db, logger, org, env } = req;

  const cusProducts = autumnCus.customer_products;
  const entity = autumnCus.entity;

  let mainCusProduct = cusProducts.find(
    (cp) =>
      !cp.product.is_add_on &&
      cp.product_id == autumnProduct.id &&
      (notNullish(entity) ? cp.internal_entity_id == entity!.internal_id : true)
  );

  if (mainCusProduct && !force) {
    let prices = mainCusProduct.customer_prices.map((cp) => cp.price);
    let isFree = isFreeProduct(prices);

    if (!isFree) {
      logger.info(
        `Customer ${
          autumnCus.id || autumnCus.email
        } already has non-free free product: ${
          mainCusProduct.product.name
        }, skipping...`
      );
      return mainCusProduct;
    }
  }

  // Handle if trialing
  let trialEndsAt = stripeSubs[0].trial_end
    ? stripeSubs[0].trial_end * 1000
    : null;

  // throw new Error("test");

  // 1. Insert custom prices...
  let customPrices = prices?.filter((p) => p.is_custom);
  if (customPrices && customPrices.length > 0) {
    await PriceService.upsert({
      db,
      data: customPrices,
    });
  }

  let newCusProduct = await createFullCusProduct({
    db,
    attachParams: {
      replaceables: [],
      customer: autumnCus,
      product: autumnProduct,
      org,
      prices: notNullish(prices) ? prices! : autumnProduct.prices,
      entitlements: notNullish(entitlements)
        ? entitlements!
        : autumnProduct.entitlements,
      freeTrial: autumnProduct.free_trial || null,
      optionsList: [],
      entities: [],
      cusProducts: cusProducts,
      features: [],
      internalEntityId: entity?.internal_id,
      entityId: entity?.id,
      isCustom: isCustom,
    },
    logger,
    trialEndsAt: trialEndsAt || undefined,
    subscriptionIds: stripeSubs.map((s) => s.id),
    anchorToUnix: anchorToUnix || stripeSubs[0].current_period_end * 1000,

    subscriptionStatus: stripeToAutumnSubStatus(
      stripeSubs[0].status
    ) as CusProductStatus,

    canceledAt: stripeSubs[0].canceled_at
      ? stripeSubs[0].canceled_at * 1000
      : null,

    createdAt: stripeSubs[0].created * 1000,
    sendWebhook: false,
  });

  logger.info(
    `Added product ${autumnProduct.name} to customer ${autumnCus.name}`
  );

  // Create sub
  let usageFeatures = autumnProduct.prices
    .filter((p) => isUsagePrice({ price: p }))
    .map((p) => (p.config as UsagePriceConfig).internal_feature_id);

  for (const sub of stripeSubs) {
    let subFromDb = await SubService.getInStripeIds({
      db,
      ids: [sub.id],
    });

    let subInterval = subToAutumnInterval(sub);

    if (subFromDb.length === 0) {
      await SubService.createSub({
        db,
        sub: constructSub({
          stripeId: sub.id,
          usageFeatures:
            subInterval.interval == BillingInterval.Month ? usageFeatures : [],
          orgId: org.id,
          env,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
        }),
      });
      logger.info(`Created sub ${sub.id} in DB`);
    } else {
      logger.info(`Sub ${sub.id} already exists in DB`);
    }
  }

  autumnCus.customer_products = [
    ...(autumnCus.customer_products || []),
    newCusProduct!,
  ];

  return newCusProduct;
};
