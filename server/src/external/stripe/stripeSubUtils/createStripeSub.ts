import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  Customer,
  FreeTrial,
  Organization,
  ErrCode,
  BillingInterval,
} from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "../stripeCusUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { ItemSet } from "@/utils/models/ItemSet.js";

// Get payment method

export const createStripeSub = async ({
  sb,
  stripeCli,
  customer,
  org,
  freeTrial,
  invoiceOnly = false,
  billingCycleAnchorUnix,
  itemSet,
  shouldPreview = false,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  customer: Customer;
  freeTrial: FreeTrial | null;
  org: Organization;
  invoiceOnly?: boolean;
  billingCycleAnchorUnix?: number;

  itemSet: ItemSet;
  shouldPreview?: boolean;
}) => {
  let paymentMethod = await getCusPaymentMethod({
    org,
    env: customer.env,
    stripeId: customer.processor.id,
    errorIfNone: !invoiceOnly, // throw error if no payment method and invoiceOnly is false
  });

  let paymentMethodData = {};
  if (paymentMethod) {
    paymentMethodData = {
      default_payment_method: paymentMethod as string,
    };
  }

  const { items, prices, interval, subMeta, usageFeatures } = itemSet;
  let subItems = items.filter(
    (i: any, index: number) =>
      prices[index].config!.interval !== BillingInterval.OneOff
  );
  let invoiceItems = items.filter(
    (i: any, index: number) =>
      prices[index].config!.interval === BillingInterval.OneOff
  );

  if (shouldPreview) {
    return await stripeCli.invoices.createPreview({
      subscription_details: {
        items: subItems as any,
        trial_end: freeTrialToStripeTimestamp(freeTrial),
        billing_cycle_anchor: billingCycleAnchorUnix,
      },
      invoice_items: invoiceItems as any,
      customer: customer.processor.id,
    });
  }

  try {
    const subscription = await stripeCli.subscriptions.create({
      ...paymentMethodData,
      customer: customer.processor.id,
      items: subItems as any,
      trial_end: freeTrialToStripeTimestamp(freeTrial),
      payment_behavior: "error_if_incomplete",
      add_invoice_items: invoiceItems,
      collection_method: invoiceOnly ? "send_invoice" : "charge_automatically",
      // metadata: subMeta || {},
      days_until_due: invoiceOnly ? 30 : undefined,

      billing_cycle_anchor: billingCycleAnchorUnix
        ? Math.floor(billingCycleAnchorUnix / 1000)
        : undefined,
    });

    // Store
    await SubService.createSub({
      sb,
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

    // if (invoiceOnly && subscription.latest_invoice) {
    //   await stripeCli.invoices.finalizeInvoice(
    //     subscription.latest_invoice as string
    //   );
    // }
    return subscription;
  } catch (error: any) {
    // console.log("Error creating stripe subscription", error?.message || error);
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
