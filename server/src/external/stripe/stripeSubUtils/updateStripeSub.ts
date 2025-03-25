import RecaseError from "@/utils/errorUtils.js";
import {
  Organization,
  Customer,
  Price,
  ErrCode,
  BillingInterval,
} from "@autumn/shared";
import Stripe from "stripe";
import { isStripeCardDeclined } from "../stripeCardUtils.js";
import { getCusPaymentMethod } from "../stripeCusUtils.js";

export const updateStripeSubscription = async ({
  org,
  customer,
  stripeCli,
  subscriptionId,
  items,
  trialEnd,
  prices,
  invoiceOnly,
}: {
  org: Organization;
  customer: Customer;
  stripeCli: Stripe;
  subscriptionId: string;
  items: any;
  prices: Price[];
  trialEnd?: number;
  invoiceOnly: boolean;
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

  let subItems = items.filter(
    (i: any, index: number) =>
      i.deleted || prices[index].config!.interval !== BillingInterval.OneOff
  );

  let subInvoiceItems = items.filter((i: any, index: number) => {
    if (index < prices.length) {
      return prices[index].config!.interval === BillingInterval.OneOff;
    }

    return false;
  });

  let prorationBehaviour = org.config.bill_upgrade_immediately
    ? "always_invoice"
    : "create_prorations";

  try {
    const sub = await stripeCli.subscriptions.update(subscriptionId, {
      items: subItems,
      proration_behavior: prorationBehaviour,
      trial_end: trialEnd,
      default_payment_method: paymentMethod as string,
      add_invoice_items: subInvoiceItems,
      ...((invoiceOnly && {
        collection_method: "send_invoice",
        days_until_due: 30,
      }) as any),
      payment_behavior: "error_if_incomplete",
    });

    // if (invoiceOnly) {
    //   await stripeCli.invoices.finalizeInvoice(sub.latest_invoice as string);
    // }

    return sub;
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
