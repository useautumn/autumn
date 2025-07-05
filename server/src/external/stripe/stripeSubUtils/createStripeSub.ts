import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  Customer,
  FreeTrial,
  Organization,
  ErrCode,
  BillingInterval,
  Reward,
} from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "../stripeCusUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { formatUnixToDateTime, generateId } from "@/utils/genUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getAlignedIntervalUnix } from "@/internal/products/prices/billingIntervalUtils.js";

// Get payment method

export const createStripeSub = async ({
  db,
  stripeCli,
  customer,
  org,
  freeTrial,
  invoiceOnly = false,
  anchorToUnix,
  itemSet,
  now,
  reward,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  customer: Customer;
  freeTrial: FreeTrial | null;
  org: Organization;
  invoiceOnly?: boolean;
  anchorToUnix?: number;
  itemSet: ItemSet;
  now?: number;
  reward?: Reward;
}) => {
  let paymentMethod = await getCusPaymentMethod({
    stripeCli,
    stripeId: customer.processor.id,
    errorIfNone: !invoiceOnly, // throw error if no payment method and invoiceOnly is false
  });

  let paymentMethodData = {};
  if (paymentMethod) {
    paymentMethodData = {
      default_payment_method: paymentMethod.id,
    };
  }

  const billingCycleAnchorUnix = anchorToUnix
    ? getAlignedIntervalUnix({
        alignWithUnix: anchorToUnix,
        interval: itemSet.interval,
        now,
      })
    : undefined;

  const { items, prices, usageFeatures } = itemSet;

  let subItems = items.filter(
    (i: any, index: number) =>
      prices[index].config!.interval !== BillingInterval.OneOff,
  );

  let invoiceItems = items.filter(
    (i: any, index: number) =>
      prices[index].config!.interval === BillingInterval.OneOff,
  );

  try {
    const subscription = await stripeCli.subscriptions.create({
      ...paymentMethodData,
      customer: customer.processor.id,
      items: subItems as any,
      trial_end: freeTrialToStripeTimestamp({ freeTrial }),
      payment_behavior: "error_if_incomplete",
      add_invoice_items: invoiceItems,
      collection_method: invoiceOnly ? "send_invoice" : "charge_automatically",
      days_until_due: invoiceOnly ? 30 : undefined,
      billing_cycle_anchor: billingCycleAnchorUnix
        ? Math.floor(billingCycleAnchorUnix / 1000)
        : undefined,

      coupon: reward ? reward.id : undefined,
    });

    // Store
    await SubService.createSub({
      db,
      sub: {
        id: generateId("sub"),
        stripe_id: subscription.id,
        stripe_schedule_id: subscription.schedule as string,
        created_at: subscription.created * 1000,
        usage_features: usageFeatures,
        org_id: org.id,
        env: customer.env,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
      },
    });

    return subscription;
  } catch (error: any) {
    console.log("Warning: Failed to create stripe subscription");
    console.log("Error code:", error.code);
    console.log("Message:", error.message);
    console.log("Decline code:", error.decline_code);

    throw new RecaseError({
      code: ErrCode.CreateStripeSubscriptionFailed,
      message: `Create stripe subscription failed ${
        error.code ? `(${error.code})` : ""
      }: ${error.message || ""}`,
      statusCode: 500,
    });
  }
};
