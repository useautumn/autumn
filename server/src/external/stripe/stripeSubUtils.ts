import {
  BillingInterval,
  CusProduct,
  CusProductStatus,
  ErrCode,
  Feature,
  FreeTrial,
  FullCusProduct,
  Price,
} from "@autumn/shared";

import { Customer, Organization } from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "./stripeCusUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { isStripeCardDeclined } from "./stripeCardUtils.js";

export const createStripeSubscription = async ({
  stripeCli,
  customer,
  org,
  items,
  freeTrial,
  metadata = {},
  prices,
}: {
  stripeCli: Stripe;
  customer: Customer;
  items: any;
  freeTrial: FreeTrial | null;
  org: Organization;
  metadata?: any;
  prices: Price[];
}) => {
  // 1. Get payment method
  let paymentMethod;
  try {
    paymentMethod = await getCusPaymentMethod({
      org,
      env: customer.env,
      stripeId: customer.processor.id,
    });
  } catch (error) {
    throw new RecaseError({
      code: ErrCode.StripeGetPaymentMethodFailed,
      message: `Failed to get payment method for customer ${customer.id}`,
      statusCode: 500,
    });
  }

  if (!paymentMethod) {
    throw new RecaseError({
      code: ErrCode.StripeGetPaymentMethodFailed,
      message: `No payment method found for customer ${customer.id}`,
      statusCode: 500,
    });
  }

  let subItems = items.filter(
    (i: any, index: number) =>
      prices[index].config!.interval !== BillingInterval.OneOff
  );
  let invoiceItems = items.filter(
    (i: any, index: number) =>
      prices[index].config!.interval === BillingInterval.OneOff
  );

  try {
    const subscription = await stripeCli.subscriptions.create({
      customer: customer.processor.id,
      default_payment_method: paymentMethod as string,
      items: subItems as any,
      trial_end: freeTrialToStripeTimestamp(freeTrial),
      payment_behavior: "error_if_incomplete",
      metadata,
      add_invoice_items: invoiceItems,
    });
    return subscription;
  } catch (error: any) {
    // console.log("Error creating stripe subscription", error?.message || error);
    console.log("Warning: Failed to create stripe subscription");
    console.log("Error code:", error.code);
    console.log("Message:", error.message);
    console.log("Decline code:", error.decline_code);

    throw new RecaseError({
      // code: ErrCode.StripeCardDeclined,
      code: ErrCode.CreateStripeSubscriptionFailed,
      message: `Stripe subscription failed (${error.code}): ${error.message}`,
      statusCode: 500,
    });

    // if (isStripeCardDeclined(error)) {

    // }

    // console.log("Error creating stripe subscription", error?.message || error);
    // console.log("Error code:", error.code);

    // throw new RecaseError({
    //   code: ErrCode.CreateStripeSubscriptionFailed,
    //   message: "Failed to create stripe subscription",
    //   statusCode: 500,
    // });
  }
};

export const updateStripeSubscription = async ({
  org,
  customer,
  stripeCli,
  subscriptionId,
  items,
  trialEnd,
  prices,
}: {
  org: Organization;
  customer: Customer;
  stripeCli: Stripe;
  subscriptionId: string;
  items: any;
  prices: Price[];
  trialEnd?: number;
}) => {
  let paymentMethod;
  try {
    paymentMethod = await getCusPaymentMethod({
      org,
      env: customer.env,
      stripeId: customer.processor.id,
    });
  } catch (error) {
    throw new RecaseError({
      code: ErrCode.StripeGetPaymentMethodFailed,
      message: `Failed to get payment method for customer ${customer.id}`,
      statusCode: 500,
    });
  }

  if (!paymentMethod) {
    throw new RecaseError({
      code: ErrCode.StripeGetPaymentMethodFailed,
      message: `No payment method found for customer ${customer.id}`,
      statusCode: 500,
    });
  }

  let subItems = items.filter(
    (i: any, index: number) =>
      i.deleted || prices[index].config!.interval !== BillingInterval.OneOff
  );
  let invoiceItems = items.filter((i: any, index: number) => {
    if (index < prices.length) {
      return prices[index].config!.interval === BillingInterval.OneOff;
    }

    return false;
  });

  try {
    const sub = await stripeCli.subscriptions.update(subscriptionId, {
      items: subItems,
      proration_behavior: "always_invoice",
      trial_end: trialEnd,
      payment_behavior: "error_if_incomplete",
      default_payment_method: paymentMethod as string,
      add_invoice_items: invoiceItems,
    });

    const subUpdate = await stripeCli.subscriptions.retrieve(subscriptionId);

    return subUpdate;
  } catch (error: any) {
    console.log("Error updating stripe subscription.", error.message);

    if (isStripeCardDeclined(error)) {
      throw new RecaseError({
        code: ErrCode.StripeCardDeclined,
        message: `Card was declined, Stripe decline code: ${error.decline_code}, Code: ${error.code}`,
        statusCode: 500,
      });
    }

    throw new RecaseError({
      code: ErrCode.StripeUpdateSubscriptionFailed,
      message: "Failed to update stripe subscription",
      statusCode: 500,
    });
  }
};

export const getStripeSubs = async ({
  stripeCli,
  subIds,
}: {
  stripeCli: Stripe;
  subIds: string[];
}) => {
  const batchGet = [];
  const getStripeSub = async (subId: string) => {
    try {
      const sub = await stripeCli.subscriptions.retrieve(subId);
      return sub;
    } catch (error: any) {
      console.log("Error getting stripe subscription.", error.message);
      return null;
    }
  };

  for (const subId of subIds) {
    batchGet.push(getStripeSub(subId));
  }
  const subs = await Promise.all(batchGet);

  return subs.filter((sub) => sub !== null);
};

export const stripeToAutumnSubStatus = (stripeSubStatus: string) => {
  switch (stripeSubStatus) {
    case "trialing":
      return CusProductStatus.Active;
    case "active":
      return CusProductStatus.Active;
    case "past_due":
      return CusProductStatus.PastDue;

    default:
      return stripeSubStatus;
  }
};

export const deleteScheduledIds = async ({
  stripeCli,
  scheduledIds,
}: {
  stripeCli: Stripe;
  scheduledIds: string[];
}) => {
  for (const scheduledId of scheduledIds) {
    try {
      await stripeCli.subscriptionSchedules.cancel(scheduledId);
    } catch (error: any) {
      console.log("Error deleting scheduled id.", error.message);
    }
  }
};

// Get in advance sub
export const getUsageBasedSub = async ({
  stripeCli,
  subIds,
  feature,
  stripeSubs,
}: {
  stripeCli: Stripe;
  subIds: string[];
  feature: Feature;
  stripeSubs?: Stripe.Subscription[];
}) => {
  let subs;
  if (stripeSubs) {
    subs = stripeSubs;
  } else {
    subs = await getStripeSubs({
      stripeCli,
      subIds,
    });
  }

  for (const stripeSub of subs) {
    let usageFeatures: string[] | null = null;

    try {
      usageFeatures = JSON.parse(stripeSub.metadata.usage_features);
    } catch (error) {
      continue;
    }

    if (
      !usageFeatures ||
      usageFeatures.find(
        (feat: any) => feat.internal_id == feature.internal_id
      ) === undefined
    ) {
      continue;
    }

    return stripeSub;
  }

  return null;
};

export const getSubItemsForCusProduct = async ({
  stripeSub,
  cusProduct,
}: {
  stripeSub: Stripe.Subscription;
  cusProduct: FullCusProduct;
}) => {
  let prices = cusProduct.customer_prices.map((cp) => cp.price);
  let product = cusProduct.product;

  let subItems = [];
  for (const item of stripeSub.items.data) {
    if (item.price.product == product.processor?.id) {
      subItems.push(item);
    } else if (prices.some((p) => p.config?.stripe_price_id == item.price.id)) {
      subItems.push(item);
    }
  }
  let otherSubItems = stripeSub.items.data.filter(
    (item) => !subItems.some((i) => i.id == item.id)
  );

  return { subItems, otherSubItems };
};

export const getStripeSchedules = async ({
  stripeCli,
  scheduleIds,
}: {
  stripeCli: Stripe;
  scheduleIds: string[];
}) => {
  const batchGet = [];
  const getStripeSchedule = async (scheduleId: string) => {
    try {
      const schedule = await stripeCli.subscriptionSchedules.retrieve(
        scheduleId
      );
      const firstItem = schedule.phases[0].items[0];
      const price = await stripeCli.prices.retrieve(firstItem.price as string);
      return { schedule, interval: price.recurring?.interval };
    } catch (error: any) {
      console.log("Error getting stripe schedule.", error.message);
      return null;
    }
  };

  for (const scheduleId of scheduleIds) {
    batchGet.push(getStripeSchedule(scheduleId));
  }

  let schedulesAndSubs = await Promise.all(batchGet);

  return schedulesAndSubs.filter((schedule) => schedule !== null);
};
