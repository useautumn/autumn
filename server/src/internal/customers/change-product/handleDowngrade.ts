import { CusProductService } from "../products/CusProductService.js";
import Stripe from "stripe";
import { AttachParams, AttachResultSchema } from "../products/AttachParams.js";
import {
  getStripeSchedules,
  getStripeSubs,
  getSubItemsForCusProduct,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { APIVersion, FullCusProduct } from "@autumn/shared";
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
import { generateId, notNullish } from "@/utils/genUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { SuccessCode } from "@autumn/shared";

const scheduleStripeSubscription = async ({
  sb,
  attachParams,
  stripeCli,
  itemSet,
  endOfBillingPeriod,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  stripeCli: Stripe;
  itemSet: ItemSet;
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
        // metadata: itemSet.subMeta,
        add_invoice_items: oneOffItems,
      },
    ],
  });

  await SubService.createSub({
    sb: sb,
    sub: {
      id: generateId("sub"),
      stripe_id: null,
      stripe_schedule_id: newSubscriptionSchedule.id,
      created_at: Date.now(),
      usage_features: itemSet.usageFeatures,
      org_id: org.id,
      env: customer.env,
    },
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
  const stripeCli = createStripeCli({
    org: attachParams.org,
    env: attachParams.customer.env,
  });
  logger.info(
    `Handling downgrade from ${curCusProduct.product.name} to ${product.name}`
  );

  // Make use of stripe subscription schedules to handle the downgrade
  logger.info("1. Cancelling current subscription (at period end)");

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

    if (notNullish(sub.schedule)) {
      await stripeCli.subscriptionSchedules.release(sub.schedule as string);
    }

    if (differenceInDays(latestEndDate, curEndDate) > 10) {
      await stripeCli.subscriptions.update(sub.id, {
        cancel_at: latestPeriodEnd,
        cancellation_details: {
          comment: "autumn_downgrade",
        },
      });
    } else {
      await stripeCli.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
        cancellation_details: {
          comment: "autumn_downgrade",
        },
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
        itemSet: itemSet,
        sb: req.sb,
        org: attachParams.org,
        env: attachParams.customer.env,
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
        sb: req.sb,
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

  // 4. Update cus product
  logger.info("3. Inserting new full cus product (starts at period end)");
  await createFullCusProduct({
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, product),
    startsAt: latestPeriodEnd * 1000,
    subscriptionScheduleIds: scheduledIds,
    nextResetAt: latestPeriodEnd * 1000,
    disableFreeTrial: true,
    isDowngrade: true,
  });

  // 5. Updating current cus product canceled_at...
  await CusProductService.update({
    sb: req.sb,
    cusProductId: curCusProduct.id,
    updates: {
      canceled_at: latestPeriodEnd * 1000,
    },
  });

  if (attachParams.org.api_version! >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        code: SuccessCode.DowngradeScheduled,
        message: `Successfully downgraded from ${curCusProduct.product.name} to ${product.name}`,
        product_ids: [product.id],
        customer_id: attachParams.customer.id,
      })
    );
  } else {
    res.status(200).json({
      success: true,
    });
  }
};

// await removePreviousScheduledProducts({
//   sb: req.sb,
//   stripeCli,
//   attachParams,
// });
