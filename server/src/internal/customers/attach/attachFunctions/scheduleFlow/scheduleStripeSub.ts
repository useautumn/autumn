import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { BillingInterval } from "@autumn/shared";
import Stripe from "stripe";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { getCusProductsWithStripeSubId } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

export const scheduleStripeSub = async ({
  db,
  attachParams,
  itemSet,
  endOfBillingPeriod,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  itemSet: ItemSet;
  endOfBillingPeriod: number;
}) => {
  const { org, customer, paymentMethod } = attachParams;
  const { items, prices } = itemSet;

  const { stripeCli } = attachParams;

  let subItems = items.filter(
    (item: any, index: number) =>
      index >= prices.length ||
      prices[index].config!.interval !== BillingInterval.OneOff,
  );
  let oneOffItems = items.filter(
    (item: any, index: number) =>
      index < prices.length &&
      prices[index].config!.interval === BillingInterval.OneOff,
  );

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,

    phases: [
      {
        items: subItems,
        default_payment_method: paymentMethod?.id,
        add_invoice_items: oneOffItems,
      },
    ],
  });

  await SubService.createSub({
    db,
    sub: {
      id: generateId("sub"),
      stripe_id: null,
      stripe_schedule_id: newSubscriptionSchedule.id,
      created_at: Date.now(),
      usage_features: itemSet.usageFeatures,
      org_id: org.id,
      env: customer.env,
      current_period_start: null,
      current_period_end: null,
    },
  });

  return newSubscriptionSchedule;
};

export const updateOtherCusProdsWithNewSchedule = async ({
  db,
  attachParams,
  newSchedule,
  otherSub,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  newSchedule: Stripe.SubscriptionSchedule;
  otherSub: Stripe.Subscription;
}) => {
  const otherCusProducts = getCusProductsWithStripeSubId({
    cusProducts: attachParams.cusProducts!,
    stripeSubId: otherSub?.id,
  });

  if (otherCusProducts.length > 0) {
    for (const otherCusProduct of otherCusProducts) {
      let newScheduledIds = [
        ...(otherCusProduct.scheduled_ids || []),
        newSchedule.id,
      ];

      await CusProductService.update({
        db,
        cusProductId: otherCusProduct.id,
        updates: {
          scheduled_ids: newScheduledIds,
        },
      });
    }
  }
};

export const handleNewScheduleForItemSet = async ({
  db,
  attachParams,
  latestPeriodEnd,
  itemSet,
  intervalToOtherSubs,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
  latestPeriodEnd: number;
  itemSet: ItemSet;
  intervalToOtherSubs: any;
}) => {
  // 1. Get sub items belongg to other cus products
  const otherSubObj = intervalToOtherSubs[itemSet.interval];
  let otherSub = otherSubObj?.otherSub || null;
  let otherSubItems = otherSubObj?.otherSubItems || [];

  // 2. Add to item set to create new schedule
  itemSet.items.push(
    ...otherSubItems.map((sub: any) => ({
      price: sub.price.id,
      quantity: sub.quantity,
    })),
  );

  // 3. Create new schedule
  const stripeSchedule = await scheduleStripeSub({
    db,
    attachParams,
    itemSet,
    endOfBillingPeriod: latestPeriodEnd,
  });

  // 4. Update other cus products with new schedule id
  await updateOtherCusProdsWithNewSchedule({
    db,
    attachParams,
    newSchedule: stripeSchedule,
    otherSub,
  });

  return stripeSchedule;
};
