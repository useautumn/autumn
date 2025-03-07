import { SupabaseClient } from "@supabase/supabase-js";
import { CusProductService } from "../products/CusProductService.js";
import Stripe from "stripe";
import { AttachParams } from "../products/AttachParams.js";
import {
  getStripeSchedules,
  getStripeSubs,
  getSubItemsForCusProduct,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { FullCusProduct } from "@autumn/shared";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { BillingInterval } from "@autumn/shared";
import {
  cancelFutureProductSchedule,
  getScheduleIdsFromCusProducts,
  updateScheduledSubWithNewItems,
} from "./scheduleUtils.js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { differenceInDays } from "date-fns";

const scheduleStripeSubscription = async ({
  attachParams,
  stripeCli,
  itemSet,
  endOfBillingPeriod,
}: {
  attachParams: AttachParams;
  stripeCli: Stripe;
  itemSet: any;
  endOfBillingPeriod: number;
}) => {
  const { org, customer } = attachParams;
  const { items, prices, subMeta } = itemSet;

  const paymentMethod = await getCusPaymentMethod({
    org,
    env: customer.env,
    stripeId: customer.processor.id,
  });

  let subItems = items.filter(
    (item: any, index: number) =>
      index >= prices.length ||
      prices[index].config!.interval !== BillingInterval.OneOff
  );
  let oneOffItems = items.filter(
    (item: any, index: number) =>
      index < prices.length &&
      prices[index].config!.interval === BillingInterval.OneOff
  );

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,

    phases: [
      {
        items: subItems,
        default_payment_method: paymentMethod as string,
        metadata: itemSet.subMeta,
        add_invoice_items: oneOffItems,
      },
    ],
  });

  return newSubscriptionSchedule.id;
};

export const getCusProductsWithStripeSubIds = async ({
  cusProducts,
  stripeSubId,
  curCusProductId,
}: {
  cusProducts: FullCusProduct[];
  stripeSubId: string;
  curCusProductId?: string;
}) => {
  return cusProducts.filter(
    (cusProduct) =>
      cusProduct.subscription_ids?.includes(stripeSubId) &&
      cusProduct.id !== curCusProductId
  );
};

export const handleDowngrade = async ({
  req,
  res,
  attachParams,
  curCusProduct,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
}) => {
  const logger = req.logtail;
  let product = attachParams.products[0];
  logger.info(
    `Handling downgrade from ${curCusProduct.product.name} to ${product.name}`
  );

  // Make use of stripe subscription schedules to handle the downgrade
  logger.info("1. Cancelling current subscription (at period end)");
  const stripeCli = createStripeCli({
    org: attachParams.org,
    env: attachParams.customer.env,
  });

  const curSubscriptions = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids!,
  });
  curSubscriptions.sort((a, b) => b.current_period_end - a.current_period_end);
  const latestPeriodEnd = curSubscriptions[0].current_period_end;

  // 1. Cancel all current subscriptions
  const intervalToOtherSubs: Record<string, any> = {};
  for (const sub of curSubscriptions) {
    let latestEndDate = new Date(latestPeriodEnd * 1000);
    let curEndDate = new Date(sub.current_period_end * 1000);

    const { otherSubItems } = await getSubItemsForCusProduct({
      stripeSub: sub,
      cusProduct: curCusProduct,
    });

    let interval = sub.items.data[0].price.recurring!.interval;
    intervalToOtherSubs[interval] = {
      otherSubItems,
      otherSub: sub,
    };

    if (differenceInDays(latestEndDate, curEndDate) > 10) {
      await stripeCli.subscriptions.update(sub.id, {
        cancel_at: latestPeriodEnd,
      });
    } else {
      await stripeCli.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
    }
  }

  // 3. Schedule new subscription IF new product is not free...
  logger.info("2. Schedule new subscription");

  // 1. Fetch scheduled subs
  let oldScheduledIds: string[] = getScheduleIdsFromCusProducts({
    cusProducts: [curCusProduct, attachParams.curScheduledProduct],
  });

  let schedules: any[] = [];

  if (oldScheduledIds.length > 0) {
    schedules = await getStripeSchedules({
      stripeCli,
      scheduleIds: oldScheduledIds,
    });
  }

  // Create new subscription schedule
  const itemSets: any[] = await getStripeSubItems({
    attachParams,
  });

  let scheduledIds: string[] = [];

  for (const itemSet of itemSets) {
    let scheduleObj = schedules.find(
      (schedule) => schedule.interval === itemSet.interval
    );

    if (scheduleObj) {
      await updateScheduledSubWithNewItems({
        scheduleObj,
        newItems: itemSet.items,
        stripeCli,
        cusProducts: [curCusProduct, attachParams.curScheduledProduct],
      });
      scheduledIds.push(scheduleObj.schedule.id);
    } else {
      const otherSubObj = intervalToOtherSubs[itemSet.interval];

      let otherSub = otherSubObj?.otherSub || null;
      let otherSubItems = otherSubObj?.otherSubItems || [];

      let otherCusProducts = otherSub
        ? await getCusProductsWithStripeSubIds({
            cusProducts: attachParams.cusProducts!,
            stripeSubId: otherSub.id,
          })
        : [];

      // If there is other sub items
      itemSet.items.push(
        ...otherSubItems.map((sub: any) => ({
          price: sub.price.id,
          quantity: sub.quantity,
        }))
      );

      let scheduleId = await scheduleStripeSubscription({
        attachParams,
        stripeCli,
        itemSet,
        endOfBillingPeriod: latestPeriodEnd,
      });
      scheduledIds.push(scheduleId);

      if (otherCusProducts.length > 0) {
        for (const otherCusProduct of otherCusProducts) {
          let newScheduledIds = [
            ...(otherCusProduct.scheduled_ids || []),
            scheduleId,
          ];
          await CusProductService.update({
            sb: req.sb,
            cusProductId: otherCusProduct.id,
            updates: { scheduled_ids: newScheduledIds },
          });
        }
      }
    }
  }

  // Remove scheduled ids from curCusProduct
  await CusProductService.update({
    sb: req.sb,
    cusProductId: curCusProduct.id,
    updates: {
      scheduled_ids: curCusProduct.scheduled_ids?.filter(
        (id) => !scheduledIds.includes(id)
      ),
    },
  });

  // For scheduled products that are not in same interval, remove from schedule
  for (const scheduleObj of schedules) {
    const { schedule, interval } = scheduleObj;

    let intervalsToRemove = [];
    if (!itemSets.some((itemSet) => itemSet.interval === interval)) {
      intervalsToRemove.push(interval);
    }

    await cancelFutureProductSchedule({
      sb: req.sb,
      org: attachParams.org,
      stripeCli,
      cusProducts: attachParams.cusProducts!,
      product: product,
      includeOldItems: false,
      logger: req.logtail,
      inIntervals: intervalsToRemove,
    });
  }

  // // Handle free product
  // if (itemSets.length === 0) {
  //   await cancelFutureProductSchedule({
  //     sb: req.sb,
  //     org: attachParams.org,
  //     stripeCli,
  //     cusProducts: attachParams.cusProducts!,
  //     product: product,
  //     includeOldItems: false,
  //     logger: req.logtail,
  //   });
  // }

  // 4. Update cus product
  logger.info("3. Inserting new full cus product (starts at period end)");
  await createFullCusProduct({
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, product),
    startsAt: latestPeriodEnd * 1000,
    subscriptionScheduleIds: scheduledIds,
    nextResetAt: latestPeriodEnd * 1000,
    disableFreeTrial: true,
  });

  res.status(200).send({ success: true });
};

// await removePreviousScheduledProducts({
//   sb: req.sb,
//   stripeCli,
//   attachParams,
// });
