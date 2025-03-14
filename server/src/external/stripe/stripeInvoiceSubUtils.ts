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
import { getCusPaymentMethod } from "./stripeCusUtils.js";

export const createStripeSubThroughInvoice = async ({
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
  } catch (error) {}

  let paymentMethodData = {};
  if (paymentMethod) {
    paymentMethodData = {
      default_payment_method: paymentMethod as string,
    };
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
      // ...paymentMethodData,
      customer: customer.processor.id,
      items: subItems as any,
      trial_end: freeTrialToStripeTimestamp(freeTrial),
      metadata,
      add_invoice_items: invoiceItems,
      collection_method: "send_invoice",
      days_until_due: 30,
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
