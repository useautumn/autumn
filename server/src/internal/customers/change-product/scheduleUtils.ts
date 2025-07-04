import {
  getStripeSchedules,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import {
  AppEnv,
  AttachScenario,
  FullCusProduct,
  Organization,
  Product,
} from "@autumn/shared";
import Stripe from "stripe";
import {
  fullCusProductToProduct,
  isActiveStatus,
} from "../cusProducts/cusProductUtils.js";
import { CusProductService } from "../cusProducts/CusProductService.js";

import { getExistingCusProducts } from "../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";

import { getFilteredScheduleItems } from "./scheduleUtils/getFilteredScheduleItems.js";
import { updateScheduledSubWithNewItems } from "./scheduleUtils/updateScheduleWithNewItems.js";
import {
  addCurMainProductToSchedule,
  getOtherCusProductsOnSub,
} from "./scheduleUtils/cancelScheduledFreeProduct.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { notNullish } from "@/utils/genUtils.js";

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
  req,
  db,
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
  req: ExtendedRequest;
  db: DrizzleCli;
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
  const { curMainProduct, curScheduledProduct } = getExistingCusProducts({
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
      org: org,
      products: [fullCurProduct],
      prices: fullCurProduct.prices,
      entitlements: fullCurProduct.entitlements,
      optionsList: [],
      entities: [],
      cusProducts,
      replaceables: [],
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
        cusProductsForGroup: [curMainProduct, curScheduledProduct],
        stripeCli: stripeCli,
        itemSet: null,
        db,
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
      logger.info("cancelFutureProductSchedule: renewing main product");

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
          if (sendWebhook) {
            await addProductsUpdatedWebhookTask({
              req,
              internalCustomerId: curMainProduct.internal_customer_id,
              org: org,
              env: env,
              customerId: null,
              scenario: AttachScenario.Renew,
              cusProduct: curMainProduct,
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

  // TODO: Check?
  if (
    !curScheduledProduct &&
    curMainProduct &&
    notNullish(curMainProduct.canceled_at)
  ) {
    logger.info(`renewing ${curMainProduct.product.name}!`);
    const batchRenew = [];
    for (const subId of curMainProduct.subscription_ids || []) {
      batchRenew.push(
        stripeCli.subscriptions.update(subId, {
          cancel_at: null,
        }),
      );
    }

    await Promise.all(batchRenew);

    return;
  }
};
