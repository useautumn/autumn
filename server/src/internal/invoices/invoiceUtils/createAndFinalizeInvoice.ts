import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import Stripe from "stripe";

export const createAndFinalizeInvoice = async ({
  stripeCli,
  paymentMethod,
  stripeCusId,
  stripeSubId,
  invoiceItems,
  errorOnPaymentFail = true,
  voidIfFailed = true,
  logger,
}: {
  stripeCli: Stripe;
  paymentMethod: Stripe.PaymentMethod | null;
  stripeCusId: string;
  stripeSubId: string;
  invoiceItems?: Stripe.InvoiceItemCreateParams[];
  errorOnPaymentFail?: boolean;
  voidIfFailed?: boolean;
  logger?: any;
}) => {
  const invoice = await stripeCli.invoices.create({
    customer: stripeCusId,
    auto_advance: false,
    subscription: stripeSubId,
  });

  if (invoiceItems) {
    for (const item of invoiceItems) {
      await stripeCli.invoiceItems.create({
        ...item,
        invoice: invoice.id!,
        customer: stripeCusId,
      });
    }
  }

  let finalInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id!, {
    auto_advance: false,
  });

  if (finalInvoice.status == "open") {
    const {
      paid,
      error,
      invoice: paidInvoice,
    } = await payForInvoice({
      stripeCli,
      invoiceId: finalInvoice.id!,
      paymentMethod,
      logger,
      errorOnFail: errorOnPaymentFail,
      voidIfFailed,
    });

    if (paid) {
      finalInvoice = paidInvoice!;
    }
  }

  return { invoice: finalInvoice };
};
