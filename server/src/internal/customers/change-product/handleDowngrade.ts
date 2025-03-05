import { SupabaseClient } from "@supabase/supabase-js";
import { CusProductService } from "../products/CusProductService.js";
import Stripe from "stripe";
import { AttachParams } from "../products/AttachParams.js";
import {
  getStripeSubs,
  getSubItemsForCusProduct,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { FullCusProduct } from "@shared/models/cusModels/cusProductModels.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { differenceInDays } from "date-fns";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { BillingInterval } from "@autumn/shared";

const scheduleStripeSubscription = async ({
  attachParams,
  stripeCli,
  itemSet,
  endOfBillingPeriod,
  otherSubs,
}: {
  attachParams: AttachParams;
  stripeCli: Stripe;
  itemSet: any;
  endOfBillingPeriod: number;
  otherSubs: any[];
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
      prices[index].config!.interval !== BillingInterval.OneOff
  );
  let oneOffItems = items.filter(
    (item: any, index: number) =>
      prices[index].config!.interval === BillingInterval.OneOff
  );

  subItems.push(
    ...otherSubs.map((sub) => ({
      price: sub.price.id,
      quantity: sub.quantity,
    }))
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

export const removePreviousScheduledProducts = async ({
  sb,
  stripeCli,
  attachParams,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  attachParams: AttachParams;
}) => {
  const { customer, org, products } = attachParams;
  let product = products[0];

  const schedules = await stripeCli.subscriptionSchedules.list({
    customer: customer.processor.id,
  });

  // Cancel previous scheduled product for same group
  for (const schedule of schedules.data) {
    const existingCusProduct = await CusProductService.getByScheduleId({
      sb: sb,
      scheduleId: schedule.id,
      orgId: attachParams.org.id,
      env: attachParams.customer.env,
    });

    if (
      existingCusProduct &&
      existingCusProduct.product.group === product.group &&
      schedule.status !== "canceled"
    ) {
      await stripeCli.subscriptionSchedules.cancel(schedule.id);
    }
  }
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
  let product = attachParams.products[0];
  console.log(
    `Handling downgrade from ${curCusProduct.product.name} to ${product.name}`
  );

  // Make use of stripe subscription schedules to handle the downgrade
  console.log("1. Cancelling current subscription (at period end)");
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

    const { subItems, otherSubItems } = await getSubItemsForCusProduct({
      stripeSub: sub,
      cusProduct: curCusProduct,
    });

    let interval = sub.items.data[0].price.recurring!.interval;
    intervalToOtherSubs[interval] = {
      otherSubItems,
      otherSub: sub,
    };

    // if (differenceInDays(latestEndDate, curEndDate) > 10) {
    //   await stripeCli.subscriptions.update(sub.id, {
    //     cancel_at: latestPeriodEnd,
    //   });
    // } else {
    //   await stripeCli.subscriptions.update(sub.id, {
    //     cancel_at_period_end: true,
    //   });
    // }
  }

  // 3. Schedule new subscription IF new product is not free...
  console.log("2. Scheduling new subscriptions");
  let subscriptionScheduleIds: any[] = [];

  if (!isFreeProduct(attachParams.prices)) {
    // await removePreviousScheduledProducts({
    //   sb: req.sb,
    //   stripeCli,
    //   attachParams,
    // });

    console.log("Cur cus product scheduled ids", curCusProduct.scheduled_ids);
    if (curCusProduct.scheduled_ids) {
      // Update relevant items in scheduled id...
      let scheduleId = curCusProduct.scheduled_ids[0];
      let schedule = await stripeCli.subscriptionSchedules.retrieve(scheduleId);
      console.log("Phase items", schedule.phases[0].items);

      let newItems = schedule.phases[0].items.map((item) => {
        let price = item.price;
        // let priceExists = attachParams.prices.find((p) => p.id === price);
      });

      // let newSchedule = await stripeCli.subscriptionSchedules.update(
      //   scheduleId,
      //   {
      //     phases: [
      //       {
      //         items: schedule.phases[0].items,
      //       },
      //       {
      //         items: schedule.phases[1].items,
      //       }
      //     ],
      //   }
      // );
      res.status(200).send({ success: true });
      return;
    }

    // Schedule all the new subscriptions to start at period end
    const itemSets: any[] = await getStripeSubItems({
      attachParams,
    });
    for (const itemSet of itemSets) {
      const { otherSubItems, otherSub } = intervalToOtherSubs[itemSet.interval];

      let otherCusProducts = await CusProductService.getByStripeSubId({
        sb: req.sb,
        stripeSubId: otherSub.id,
        orgId: attachParams.org.id,
        env: attachParams.customer.env,
      });

      // Append metadata to other sub items bruhhhh

      let scheduleId = await scheduleStripeSubscription({
        attachParams,
        stripeCli,
        itemSet,
        endOfBillingPeriod: latestPeriodEnd,
        otherSubs: otherSubItems,
      });
      subscriptionScheduleIds.push(scheduleId);

      for (const otherCusProduct of otherCusProducts) {
        await CusProductService.update({
          sb: req.sb,
          cusProductId: otherCusProduct.id,
          updates: {
            scheduled_ids: [
              ...(otherCusProduct.scheduled_ids || []),
              scheduleId,
            ],
          },
        });
      }
    }
  }

  res.status(200).send({ success: true });
};
