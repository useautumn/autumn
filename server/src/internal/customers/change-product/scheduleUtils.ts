import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import {
  getStripeSchedules,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import {
  AppEnv,
  AttachScenario,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  FullProduct,
  Organization,
  Product,
} from "@autumn/shared";
import Stripe from "stripe";
import {
  fullCusProductToProduct,
  isActiveStatus,
} from "../products/cusProductUtils.js";
import { CusProductService } from "../products/CusProductService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";

import { getFilteredScheduleItems } from "./scheduleUtils/getFilteredScheduleItems.js";
import { updateScheduledSubWithNewItems } from "./scheduleUtils/updateScheduleWithNewItems.js";
import {
  addCurMainProductToSchedule,
  getOtherCusProductsOnSub,
} from "./scheduleUtils/cancelScheduledFreeProduct.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import {
  addProductsUpdatedWebhookTask,
  constructProductsUpdatedData,
} from "@/external/svix/handleProductsUpdatedWebhook.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const getPricesForCusProduct = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  if (!cusProduct) {
    return [];
  }
  return cusProduct.customer_prices.map((price) => price.price);
};

export const getScheduleIdsFromCusProducts = ({
  cusProducts,
}: {
  cusProducts: (FullCusProduct | null | undefined)[];
}) => {
  let scheduleIds: string[] = [];
  for (const cusProduct of cusProducts) {
    if (cusProduct) {
      scheduleIds = scheduleIds.concat(cusProduct.scheduled_ids || []);
    }
  }
  return scheduleIds;
};

// CANCELLING FUTURE PRODUCT
export const cancelFutureProductSchedule = async ({
  db,
  sb,
  org,
  stripeCli,
  cusProducts,
  product,
  includeOldItems = true,
  logger,
  inIntervals,
  env,
  internalEntityId,
  renewCurProduct = true,
  sendWebhook = true,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  org: Organization;
  stripeCli: Stripe;
  cusProducts: FullCusProduct[];
  product: Product;
  includeOldItems?: boolean;
  logger: any;
  inIntervals?: string[];
  env: AppEnv;
  internalEntityId?: string | null;
  renewCurProduct?: boolean;
  sendWebhook?: boolean;
}) => {
  // 1. Get main and scheduled products
  const { curMainProduct, curScheduledProduct } = await getExistingCusProducts({
    product,
    cusProducts,
    internalEntityId,
  });

  if (!curMainProduct) {
    return;
  }

  // 2. Get schedules
  const schedules = await getStripeSchedules({
    stripeCli: stripeCli,
    scheduleIds: getScheduleIdsFromCusProducts({
      cusProducts: [curMainProduct, curScheduledProduct],
    }),
  });

  // 3. Get current subs
  const curSubs = await getStripeSubs({
    stripeCli: stripeCli,
    subIds: curMainProduct.subscription_ids || [],
  });

  // 3. Get old item sets
  let fullCurProduct = fullCusProductToProduct(curMainProduct);
  let oldItemSets = await getStripeSubItems({
    attachParams: {
      customer: curMainProduct.customer,
      org: org,
      products: [fullCurProduct],
      prices: fullCurProduct.prices,
      entitlements: fullCurProduct.entitlements,
      freeTrial: null,
      optionsList: [],
      entities: [],
      features: [],
    },
  });

  /* 
    4. For each schedule, either do:
      - Update schedule with old items
      - Cancel schedule
  */

  // Case where cur scheduled product is not free
  for (const scheduleObj of schedules) {
    const { schedule, interval, prices } = scheduleObj;

    if (inIntervals && !inIntervals.includes(interval!)) {
      continue;
    }

    // 1. Remove cur scheduled product items from schedule
    const activeCusProducts = cusProducts.filter((cusProduct) =>
      isActiveStatus(cusProduct?.status),
    );
    const filteredScheduleItems = getFilteredScheduleItems({
      scheduleObj,
      // cusProducts: [curMainProduct, curScheduledProduct],
      cusProducts: [...activeCusProducts, curScheduledProduct],
    });

    // 2. If any items left, update schedule with cur main product!
    if (filteredScheduleItems.length > 0) {
      let oldItemSet = oldItemSets.find(
        (itemSet) => itemSet.interval === interval,
      );

      await updateScheduledSubWithNewItems({
        scheduleObj: scheduleObj,
        newItems: includeOldItems ? oldItemSet?.items || [] : [],
        cusProducts: [curMainProduct, curScheduledProduct],
        stripeCli: stripeCli,
        itemSet: null,
        sb: sb,
        org: org,
        env: env,
      });

      // Put back schedule id into curMainProduct
      if (includeOldItems && renewCurProduct) {
        await CusProductService.update({
          db,
          cusProductId: curMainProduct!.id,
          updates: {
            scheduled_ids: [
              ...(curMainProduct!.scheduled_ids || []),
              schedule.id,
            ],
          },
        });
      } else {
        // Remove schedule id from curMainProduct
        await CusProductService.update({
          db,
          cusProductId: curMainProduct!.id,
          updates: {
            scheduled_ids: curMainProduct!.scheduled_ids?.filter(
              (id) => id !== schedule.id,
            ),
          },
        });
      }

      logger.info(`✅ Updated schedule: ${schedule.id}`);
    }

    // 99% of cases, should just cancel schedule
    else {
      logger.info(`Interval: ${interval}, cancelling schedule: ${schedule.id}`);
      try {
        await stripeCli.subscriptionSchedules.cancel(schedule.id);
      } catch (error: any) {
        logger.warn(
          `❌ Error cancelling schedule: ${schedule.id}, ${error.message}`,
        );
      }

      const subWithSameInterval = curSubs.find(
        (sub) =>
          sub.items.data.length > 0 &&
          sub.items.data[0]?.price?.recurring?.interval === interval,
      );

      if (subWithSameInterval && renewCurProduct) {
        await stripeCli.subscriptions.update(subWithSameInterval.id, {
          cancel_at: null,
        });
        await CusProductService.update({
          db,
          cusProductId: curMainProduct!.id,
          updates: {
            canceled_at: null,
          },
        });
      }
      logger.info(`✅ Cancelled schedule: ${schedule.id}`);
    }
  }

  // Handle case where scheduled product is free
  if (
    includeOldItems &&
    curScheduledProduct &&
    isFreeProduct(getPricesForCusProduct({ cusProduct: curScheduledProduct! }))
  ) {
    logger.info(`CASE: DELETING FREE SCHEDULED PRODUCT`);

    // 1. Look at main product
    let curMainSubIds = curMainProduct.subscription_ids;

    // 2. Check if there are other products with same subscription and scheduled ids
    let otherCusProductsWithSameSub = await getOtherCusProductsOnSub({
      cusProducts,
      curMainProduct,
      curMainSubIds,
    });

    if (otherCusProductsWithSameSub.length > 0) {
      await addCurMainProductToSchedule({
        db,
        sb,
        org,
        env,
        stripeCli,
        otherCusProductsOnSub: otherCusProductsWithSameSub,
        oldItemSets,
        curMainProduct,
        logger,
      });
    }

    // 99% of cases!
    else {
      logger.info(
        "No other cus products with same sub, uncanceling current main product",
      );

      if (curMainSubIds && curMainSubIds.length > 0) {
        for (const subId of curMainSubIds) {
          await stripeCli.subscriptions.update(subId, {
            cancel_at: null,
          });
        }

        await CusProductService.update({
          db,
          cusProductId: curMainProduct!.id,
          updates: {
            canceled_at: null,
          },
        });

        try {
          let product = curMainProduct.product;
          let prices = curMainProduct.customer_prices.map(
            (cp: FullCustomerPrice) => cp.price,
          );
          let entitlements = curMainProduct.customer_entitlements.map(
            (ce: FullCustomerEntitlement) => ce.entitlement,
          );

          if (sendWebhook) {
            await addProductsUpdatedWebhookTask({
              internalCustomerId: curMainProduct.internal_customer_id,
              org: org,
              env: env,
              customerId: null,
              scenario: AttachScenario.Renew,
              product: product,
              prices: prices,
              entitlements: entitlements,
              freeTrial: curMainProduct.free_trial || null,
              logger: logger,
            });
          }
        } catch (error) {
          logger.error(
            `❌ Error sending products updated webhook from cancelFutureProductSchedule: ${error}`,
          );
        }
      }
    }
  }
};
