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

export const getPricesForCusProduct = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  return cusProduct.customer_prices.map((price) => price.price);
};

export const getFilteredScheduleItems = ({
  scheduleObj,
  curCusProduct,
}: {
  scheduleObj: any;
  curCusProduct: FullCusProduct;
}) => {
  const { schedule, interval } = scheduleObj;

  let curPrices = getPricesForCusProduct({
    cusProduct: curCusProduct,
  });

  return schedule.phases[0].items.filter(
    (scheduleItem: any) =>
      !curPrices.some(
        (price) => price.config?.stripe_price_id === scheduleItem.price
      )
  );
};

export const updateScheduledSubWithNewItems = async ({
  scheduleObj,
  newItems,
  curCusProduct,
  stripeCli,
}: {
  scheduleObj: any;
  newItems: any[];
  curCusProduct: FullCusProduct;
  stripeCli: Stripe;
}) => {
  const { schedule, interval } = scheduleObj;

  let curPrices = getPricesForCusProduct({
    cusProduct: curCusProduct,
  });

  let filteredScheduleItems = schedule.phases[0].items.filter(
    (scheduleItem: any) =>
      !curPrices.some(
        (price) => price.config?.stripe_price_id === scheduleItem.price
      )
  );

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
  console.log(`✅ Updated schedule with new items: ${schedule.id}`);
};

// CANCELLING FUTURE PRODUCT
export const cancelFutureProductSchedule = async ({
  sb,
  org,
  stripeCli,
  cusProducts,
  product,
}: {
  sb: SupabaseClient;
  org: Organization;
  stripeCli: Stripe;
  cusProducts: FullCusProduct[];
  product: FullProduct;
}) => {
  const { curMainProduct, curScheduledProduct } = await getExistingCusProducts({
    sb,
    product,
    cusProducts,
  });

  if (!curScheduledProduct || !curMainProduct) {
    return;
  }

  // 1. Get schedules
  const schedules = await getStripeSchedules({
    stripeCli: stripeCli,
    scheduleIds: curScheduledProduct.scheduled_ids || [],
  });

  // 2. Get current subs
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
    },
  });

  /* 
    4. For each schedule, either do:
      - Update schedule with old items
      - Cancel schedule
  */
  for (const scheduleObj of schedules) {
    const filteredScheduleItems = getFilteredScheduleItems({
      scheduleObj: scheduleObj,
      curCusProduct: curScheduledProduct,
    });

    let cancelSchedule = filteredScheduleItems.length === 0;
    if (!cancelSchedule) {
      const activeCusProducts = cusProducts.filter(
        (cusProduct) => cusProduct.status === CusProductStatus.Active
      );

      const trulyScheduledItems = filteredScheduleItems.filter((item: any) => {
        let allCusPrices: any[] = [];
        for (const cusProd of activeCusProducts) {
          let cusPrices = getPricesForCusProduct({
            cusProduct: cusProd,
          });
          allCusPrices = allCusPrices.concat(cusPrices);
        }

        return allCusPrices.some(
          (price) => price.config?.stripe_price_id === item.price
        );
      });

      if (trulyScheduledItems.length > 0) {
        cancelSchedule = true;
      }
    }

    const { schedule, interval } = scheduleObj;

    if (!cancelSchedule) {
      let oldItems = oldItemSets.find(
        (itemSet) => itemSet.interval === interval
      )?.items;

      await updateScheduledSubWithNewItems({
        scheduleObj: scheduleObj,
        newItems: oldItems,
        curCusProduct: curScheduledProduct,
        stripeCli: stripeCli,
      });

      // Put back schedule id into curMainProduct
      await CusProductService.update({
        sb,
        cusProductId: curMainProduct.id,
        updates: {
          scheduled_ids: [...(curMainProduct.scheduled_ids || []), schedule.id],
        },
      });
    } else {
      await stripeCli.subscriptionSchedules.cancel(schedule.id);

      // Activate curCusProduct's subscription if not already canceled
      // Get sub with same interval
      const subWithSameInterval = curSubs.find(
        (sub) => sub.items.data[0].price.recurring?.interval === interval
      );
      if (subWithSameInterval) {
        await stripeCli.subscriptions.update(subWithSameInterval.id, {
          cancel_at: null,
        });
      }
      console.log(`✅ Cancelled schedule: ${schedule.id}`);
    }
  }
};
