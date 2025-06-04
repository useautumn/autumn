import RecaseError from "@/utils/errorUtils.js";
import {
  Organization,
  Customer,
  ErrCode,
  BillingInterval,
} from "@autumn/shared";

import Stripe from "stripe";
import { isStripeCardDeclined } from "../stripeCardUtils.js";
import { getCusPaymentMethod } from "../stripeCusUtils.js";
import { ProrationBehavior } from "@/internal/customers/change-product/handleUpgrade.js";
import { getStripeProrationBehavior } from "../stripeSubUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { payForInvoice } from "../stripeInvoiceUtils.js";
import { differenceInSeconds } from "date-fns";

export const updateStripeSubscription = async ({
  db,
  org,
  customer,
  stripeCli,
  curSub,
  subscriptionId,
  trialEnd,
  invoiceOnly,
  prorationBehavior,
  itemSet,
  shouldPreview,
  logger,
  invoiceItems,
}: {
  db: DrizzleCli;
  org: Organization;
  customer: Customer;
  stripeCli: Stripe;
  curSub: Stripe.Subscription;
  subscriptionId: string;
  trialEnd?: number | null;
  invoiceOnly: boolean;
  prorationBehavior?: ProrationBehavior;
  itemSet: ItemSet;
  shouldPreview?: boolean;
  logger: any;
  invoiceItems?: Stripe.InvoiceItem[];
}) => {
  let paymentMethod = await getCusPaymentMethod({
    stripeCli,
    stripeId: customer.processor.id,
    errorIfNone: !invoiceOnly, // throw error if no payment method and invoiceOnly is false
  });

  let { items, prices } = itemSet;

  let subItems = items.filter(
    (i: any, index: number) =>
      i.deleted || prices[index].config!.interval !== BillingInterval.OneOff,
  );

  let subInvoiceItems = items.filter((i: any, index: number) => {
    if (index < prices.length) {
      return prices[index].config!.interval === BillingInterval.OneOff;
    }

    return false;
  });

  let stripeProration = getStripeProrationBehavior({
    org,
    prorationBehavior,
  });

  if (shouldPreview) {
    let preview = await stripeCli.invoices.createPreview({
      subscription_details: {
        items: subItems,
        proration_behavior: stripeProration as any,
        trial_end: trialEnd as any,
      },
      subscription: subscriptionId,
      invoice_items: subInvoiceItems,
      customer: customer.processor.id,
    });
    return {
      preview,
      sub: null,
      invoice: null,
    };
  }

  // 1. Update subscription
  let sub: Stripe.Subscription | null = null;
  try {
    sub = await stripeCli.subscriptions.update(subscriptionId, {
      items: subItems,
      proration_behavior: "create_prorations",
      trial_end: trialEnd,
      default_payment_method: paymentMethod?.id,
      add_invoice_items: [...subInvoiceItems, ...(invoiceItems || [])],
      ...((invoiceOnly && {
        collection_method: "send_invoice",
        days_until_due: 30,
      }) as any),
      payment_behavior: "error_if_incomplete",
      expand: ["latest_invoice"],
    });
  } catch (error: any) {
    throw error;
  }

  // 2. Try to pay invoice
  let invoice: Stripe.Invoice | null = null;
  const latestInvoice = sub.latest_invoice as Stripe.Invoice;

  if (prorationBehavior === ProrationBehavior.Immediately) {
    // If latest invoice is different, no need to create a new invoice
    if (latestInvoice.id != curSub.latest_invoice) {
      sub.latest_invoice = latestInvoice.id;
      return {
        preview: null,
        sub,
        invoice: latestInvoice,
      };
    }

    invoice = await stripeCli.invoices.create({
      customer: customer.processor.id,
      subscription: subscriptionId,
      auto_advance: false,
    });

    if (!invoiceOnly) {
      await stripeCli.invoices.finalizeInvoice(invoice.id, {
        auto_advance: false,
      });

      try {
        const { invoice: subInvoice } = await payForInvoice({
          stripeCli,
          paymentMethod,
          invoiceId: invoice.id,
          logger,
          voidIfFailed: true,
        });
        invoice = subInvoice;
      } catch (error: any) {
        const prevItems = curSub.items.data.map((item) => {
          return {
            price: item.price.id,
            quantity: item.quantity,
          };
        });

        const deleteNewItems = sub.items.data
          .filter(
            (item) =>
              !prevItems.some((prevItem) =>
                curSub.items.data.some(
                  (curItem) => curItem.price.id === item.price.id,
                ),
              ),
          )
          .map((item) => {
            return {
              id: item.id,
              deleted: true,
            };
          });

        await stripeCli.subscriptions.update(subscriptionId, {
          items: [...prevItems, ...deleteNewItems],
          proration_behavior: "none",
        });

        throw new RecaseError({
          code: ErrCode.UpdateSubscriptionFailed,
          message: `Failed to update subscription. ${error.message}`,
          statusCode: 500,
          data: `Stripe error: ${error.message}`,
        });
      }
    }
  }

  // Upsert sub
  await SubService.addUsageFeatures({
    db,
    stripeId: subscriptionId,
    usageFeatures: itemSet.usageFeatures,
    orgId: org.id,
    env: customer.env,
  });

  if (invoice) {
    sub.latest_invoice = invoice.id;
  } else {
    sub.latest_invoice = null;
  }

  return {
    preview: null,
    sub,
    invoice,
  };
};
