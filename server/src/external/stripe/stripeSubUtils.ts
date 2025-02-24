import { ErrCode, FreeTrial } from "@autumn/shared";

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
}: {
  stripeCli: Stripe;
  customer: Customer;
  items: any;
  freeTrial: FreeTrial | null;
  org: Organization;
  metadata?: any;
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

  try {
    const subscription = await stripeCli.subscriptions.create({
      customer: customer.processor.id,
      default_payment_method: paymentMethod as string,
      items: items as any,
      trial_end: freeTrialToStripeTimestamp(freeTrial),
      payment_behavior: "error_if_incomplete",
      metadata,
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
}: {
  org: Organization;
  customer: Customer;
  stripeCli: Stripe;
  subscriptionId: string;
  items: any;
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

  try {
    const sub = await stripeCli.subscriptions.update(subscriptionId, {
      items,
      proration_behavior: "always_invoice",
      trial_end: trialEnd,
      payment_behavior: "error_if_incomplete",
      default_payment_method: paymentMethod as string,
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
