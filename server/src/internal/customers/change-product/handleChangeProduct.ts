import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  isFreeProduct,
  isProductUpgrade,
  isSameBillingInterval,
} from "@/internal/products/productUtils.js";
import Stripe from "stripe";

import { CusProductWithProduct, FullCusProduct } from "@autumn/shared";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";

import { CusProductService } from "../products/CusProductService.js";
import { AttachParams } from "../products/AttachParams.js";
import { handleUpgrade } from "./handleUpgrade.js";
import { differenceInDays } from "date-fns";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";

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
  const { items, subMeta } = itemSet;
  const paymentMethod = await getCusPaymentMethod({
    org,
    env: customer.env,
    stripeId: customer.processor.id,
  });

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,
    phases: [
      {
        items,
        default_payment_method: paymentMethod as string,
        metadata: itemSet.subMeta,
      },
    ],
  });

  return newSubscriptionSchedule.id;
};

const handleDowngrade = async ({
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
  console.log(
    `Handling downgrade from ${curCusProduct.product.name} to ${attachParams.product.name}`
  );

  // 1. Cancel current subscription
  console.log("1. Cancelling current subscription (at period end)");

  const stripeCli = createStripeCli({
    org: attachParams.org,
    env: attachParams.customer.env,
  });

  // 1. Fetch current subscriptions
  const curSubscriptions = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids!,
  });

  let latestPeriodEnd = 0;
  for (const subscription of curSubscriptions) {
    if (subscription.current_period_end > latestPeriodEnd) {
      latestPeriodEnd = subscription.current_period_end;
    }
  }

  for (const subscription of curSubscriptions) {
    let periodEnd = subscription.current_period_end;
    // If difference in days is greater than 10, cancel at period end
    let latestEndDate = new Date(latestPeriodEnd * 1000);
    let curEndDate = new Date(periodEnd * 1000);
    console.log(
      `Difference in days: ${differenceInDays(latestEndDate, curEndDate)}`
    );

    if (differenceInDays(latestEndDate, curEndDate) > 10) {
      await stripeCli.subscriptions.update(subscription.id, {
        cancel_at: latestPeriodEnd,
      });
    } else {
      await stripeCli.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });
      console.log(`Cancelled subscription ${subscription.id} at period end`);
    }
  }

  // 3. Schedule new subscription IF new product is not free...
  console.log("2. Scheduling new subscription");

  let subscriptionScheduleIds: any[] = [];
  if (!isFreeProduct(attachParams.prices)) {
    // Delete previous schedules
    const schedules = await stripeCli.subscriptionSchedules.list({
      customer: attachParams.customer.processor.id,
    });

    for (const schedule of schedules.data) {
      const existingCusProduct = await CusProductService.getByScheduleId({
        sb: req.sb,
        scheduleId: schedule.id,
      });

      // Delete only if not in the same group
      if (
        (!existingCusProduct ||
          existingCusProduct.product.group === attachParams.product.group) &&
        schedule.status !== "canceled"
      ) {
        await stripeCli.subscriptionSchedules.cancel(schedule.id);
      }
    }

    // Schedule all the new subscriptions to start at period end
    const itemSets = await getStripeSubItems({
      attachParams,
    });

    for (const itemSet of itemSets) {
      let scheduleId = await scheduleStripeSubscription({
        attachParams,
        stripeCli,
        itemSet,
        endOfBillingPeriod: latestPeriodEnd,
      });
      subscriptionScheduleIds.push(scheduleId);
    }
  }

  // 2. Insert new full cus product with starts_at later than current billing period
  console.log("3. Inserting new full cus product (starts at period end)");
  await createFullCusProduct({
    sb: req.sb,
    attachParams,
    subscriptionId: undefined,
    startsAt: latestPeriodEnd * 1000,
    subscriptionScheduleIds: subscriptionScheduleIds,
    nextResetAt: latestPeriodEnd * 1000,
    disableFreeTrial: true,
  });

  res.status(200).json({ success: true, message: "Downgrade handled" });
};

export const handleChangeProduct = async ({
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
  // Get subscription
  const curProduct = curCusProduct.product;
  const { org, customer, product, prices, entitlements, optionsList } =
    attachParams;

  const curFullProduct = await ProductService.getFullProductStrict({
    sb: req.sb,
    productId: curProduct.id,
    orgId: org.id,
    env: customer.env,
  });

  const isUpgrade = isProductUpgrade(curFullProduct, product);

  if (!isUpgrade) {
    await handleDowngrade({
      req,
      res,
      attachParams,
      curCusProduct,
    });
    return;
  } else {
    await handleUpgrade({
      req,
      res,
      attachParams,
      curCusProduct,
      curFullProduct,
    });
  }
};
