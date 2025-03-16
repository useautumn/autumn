import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  Customer,
  FreeTrial,
  Organization,
  Price,
  ErrCode,
  BillingInterval,
} from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "../stripeCusUtils.js";
import { getNextStartOfMonthUnix } from "@/internal/prices/billingIntervalUtils.js";

// Get payment method

export const createStripeSub = async ({
  stripeCli,
  customer,
  org,
  freeTrial,
  invoiceOnly = false,
  billingCycleAnchorUnix,
  itemSet,
}: {
  stripeCli: Stripe;
  customer: Customer;
  freeTrial: FreeTrial | null;
  org: Organization;
  invoiceOnly?: boolean;
  billingCycleAnchorUnix?: number;

  itemSet: {
    items: any;
    subMeta: any;
    prices: Price[];
    interval: BillingInterval;
  };
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

  const { items, prices, interval, subMeta } = itemSet;
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
      ...paymentMethodData,
      customer: customer.processor.id,
      items: subItems as any,
      trial_end: freeTrialToStripeTimestamp(freeTrial),
      payment_behavior: "error_if_incomplete",
      add_invoice_items: invoiceItems,
      metadata: subMeta || {},
      collection_method: invoiceOnly ? "send_invoice" : "charge_automatically",
      days_until_due: invoiceOnly ? 30 : undefined,

      billing_cycle_anchor: billingCycleAnchorUnix
        ? Math.floor(billingCycleAnchorUnix / 1000)
        : undefined,
    });

    if (invoiceOnly && subscription.latest_invoice) {
      await stripeCli.invoices.finalizeInvoice(
        subscription.latest_invoice as string
      );
    }
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
