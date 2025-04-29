import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import {
  getStripeSchedules,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import {
  AppEnv,
  CusProductStatus,
  FullCusProduct,
  FullProduct,
  Organization,
} from "@autumn/shared";
import Stripe from "stripe";
import { fullCusProductToProduct } from "../products/cusProductUtils.js";
import { CusProductService } from "../products/CusProductService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "../products/AttachParams.js";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";
import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";

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

export const getFilteredScheduleItems = ({
  scheduleItems,
  cusProducts,
}: {
  scheduleItems: any[];
  cusProducts: (FullCusProduct | null | undefined)[];
}) => {
  let curPrices: any[] = [];
  for (const cusProduct of cusProducts) {
    if (cusProduct) {
      curPrices = curPrices.concat(getPricesForCusProduct({ cusProduct }));
    }
  }

  return scheduleItems.filter(
    (scheduleItem: any) =>
      !curPrices.some(
        (price) => price.config?.stripe_price_id === scheduleItem.price
      )
  );
};

export const updateScheduledSubWithNewItems = async ({
  sb,
  scheduleObj,
  newItems,
  cusProducts,
  stripeCli,
  itemSet,
  org,
  env,
}: {
  sb: SupabaseClient;
  scheduleObj: any;
  newItems: any[];
  cusProducts: (FullCusProduct | null | undefined)[];
  stripeCli: Stripe;
  itemSet: ItemSet | null;
  org: Organization;
  env: AppEnv;
}) => {
  const { schedule, interval } = scheduleObj;

  let filteredScheduleItems = getFilteredScheduleItems({
    scheduleItems: schedule.phases[0].items,
    cusProducts: cusProducts,
  });

  // 2. Add new schedule items
  let newScheduleItems = filteredScheduleItems
    .map((item: any) => ({
      price: item.price,
    }))
    .concat(
      ...newItems.map((item: any) => ({
        price: item.price,
      }))
    );

  await stripeCli.subscriptionSchedules.update(schedule.id, {
    phases: [
      {
        items: newScheduleItems,
        start_date: schedule.phases[0].start_date,
      },
    ],
  });

  // Update sub schedule ID
  if (itemSet) {
    await SubService.addUsageFeatures({
      sb,
      scheduleId: scheduleObj.schedule.id,
      usageFeatures: itemSet.usageFeatures,
      orgId: org.id,
      env: env,
    });
  }
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
  sb,
  org,
  stripeCli,
  cusProducts,
  product,
  includeOldItems = true,
  logger,
  inIntervals,
  env,
}: {
  sb: SupabaseClient;
  org: Organization;
  stripeCli: Stripe;
  cusProducts: FullCusProduct[];
  product: FullProduct;
  includeOldItems?: boolean;
  logger: any;
  inIntervals?: string[];
  env: AppEnv;
}) => {
  // 1. Get main and scheduled products
  const { curMainProduct, curScheduledProduct } = await getExistingCusProducts({
    product,
    cusProducts,
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
    },
  });

  /* 
    4. For each schedule, either do:
      - Update schedule with old items
      - Cancel schedule
  */

  for (const scheduleObj of schedules) {
    const { schedule, interval } = scheduleObj;

    if (inIntervals && !inIntervals.includes(interval!)) {
      continue;
    }

    const filteredScheduleItems = getFilteredScheduleItems({
      scheduleItems: schedule.phases[0].items,
      cusProducts: [curMainProduct, curScheduledProduct],
    });

    let updateSchedule = filteredScheduleItems.length > 0;

    if (updateSchedule) {
      // If scheduled items are all active cus products, can just cancel schedule...
      const activeCusProducts = cusProducts.filter(
        (cusProduct) => cusProduct.status === CusProductStatus.Active
      );

      const scheduledItemsWithoutActiveCusProducts = getFilteredScheduleItems({
        scheduleItems: filteredScheduleItems,
        cusProducts: activeCusProducts,
      });

      if (scheduledItemsWithoutActiveCusProducts.length == 0) {
        updateSchedule = false;
      }
    }

    if (updateSchedule) {
      let oldItemSet = oldItemSets.find(
        (itemSet) => itemSet.interval === interval
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
      if (includeOldItems) {
        await CusProductService.update({
          sb,
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
          sb,
          cusProductId: curMainProduct!.id,
          updates: {
            scheduled_ids: curMainProduct!.scheduled_ids?.filter(
              (id) => id !== schedule.id
            ),
          },
        });
      }

      logger.info(`✅ Updated schedule: ${schedule.id}`);
    } else {
      try {
        await stripeCli.subscriptionSchedules.cancel(schedule.id);
      } catch (error: any) {
        logger.warn(
          `❌ Error cancelling schedule: ${schedule.id}, ${error.message}`
        );
      }

      const subWithSameInterval = curSubs.find(
        (sub) =>
          sub.items.data.length > 0 &&
          sub.items.data[0]?.price?.recurring?.interval === interval
      );

      if (subWithSameInterval) {
        await stripeCli.subscriptions.update(subWithSameInterval.id, {
          cancel_at: null,
        });
        await CusProductService.update({
          sb,
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
    logger.info("Handling case if curScheduledProduct is free");
    // 1. Look at main product
    let curMainSubIds = curMainProduct.subscription_ids;

    // 2. Check if there are other products with same subscription and scheduled ids
    let otherCusProductsWithSameSub: FullCusProduct[] = [];
    for (const cusProduct of cusProducts) {
      // 1. Check if contains one of the curMainSubIds
      if (
        cusProduct.id === curMainProduct.id ||
        !curMainSubIds?.some((subId) =>
          cusProduct?.subscription_ids?.includes(subId)
        )
      ) {
        continue;
      }

      // 2. Check if there's a scheduled product
      let { curScheduledProduct: otherScheduledProduct } =
        await getExistingCusProducts({
          product: cusProduct.product,
          cusProducts: cusProducts,
        });

      if (otherScheduledProduct) {
        otherCusProductsWithSameSub.push(otherScheduledProduct);
      }
    }

    if (otherCusProductsWithSameSub.length > 0) {
      let schedules = await getStripeSchedules({
        stripeCli: stripeCli,
        scheduleIds: getScheduleIdsFromCusProducts({
          cusProducts: otherCusProductsWithSameSub,
        }),
      });

      for (const scheduleObj of schedules) {
        const { schedule, interval } = scheduleObj;

        // Get new items
        let oldItemSet = oldItemSets.find(
          (itemSet) => itemSet.interval === interval
        );

        await updateScheduledSubWithNewItems({
          scheduleObj: scheduleObj,
          newItems: oldItemSet?.items || [],
          cusProducts: [],
          stripeCli: stripeCli,
          itemSet: null,
          sb: sb,
          org: org,
          env: env,
        });

        // Put back schedule id into curMainProduct
        await CusProductService.update({
          sb,
          cusProductId: curMainProduct!.id,
          updates: {
            scheduled_ids: [
              ...(curMainProduct!.scheduled_ids || []),
              schedule.id,
            ],
          },
        });
        logger.info(
          `✅ Added old items for product ${fullCurProduct.name} to schedule: ${schedule.id}`
        );
      }
    } else {
      // TODO: Check if this is correct
      logger.info(
        "No other cus products with same sub, uncanceling current main product"
      );

      if (curMainSubIds && curMainSubIds.length > 0) {
        await stripeCli.subscriptions.update(curMainSubIds[0], {
          cancel_at: null,
        });
        await CusProductService.update({
          sb,
          cusProductId: curMainProduct!.id,
          updates: {
            canceled_at: null,
          },
        });
      }
    }
  }
};
