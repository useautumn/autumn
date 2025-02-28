import { Customer, Feature, InvoiceItem } from "@autumn/shared";
import { format } from "date-fns";
import { Decimal } from "decimal.js";
import Stripe from "stripe";

export const createStripeInvoiceItem = async ({
  stripeCli,
  sub,
  customer,
  invoiceItem,
  feature,
  invoiceId,
}: {
  stripeCli: Stripe;
  customer: Customer;
  invoiceItem: InvoiceItem;
  feature: Feature;
  sub?: Stripe.Subscription;
  invoiceId?: string;
}) => {
  let startString = format(invoiceItem.proration_start, "dd MMM yyyy HH:mm");
  let endString = format(invoiceItem.proration_end, "dd MMM yyyy HH:mm");

  let identifier = invoiceId
    ? {
        invoice: invoiceId,
      }
    : {
        subscription: sub!.id,
      };
  await stripeCli.invoiceItems.create({
    ...identifier,
    customer: customer.processor.id,
    amount: Math.round(invoiceItem.amount! * 100),
    currency: invoiceItem.currency,
    description: `${invoiceItem.quantity}x ${feature.name}\t\t-- from ${startString} to ${endString}`,
    // period: {
    //   start: Math.round(invoiceItem.proration_start / 1000),
    //   end: Math.round(invoiceItem.proration_end / 1000),
    // },
    period: {
      start: Math.round(invoiceItem.period_start / 1000),
      end: Math.round(invoiceItem.period_end / 1000),
    },
  });
};
