import Stripe from "stripe";

export const createAndFinalizeInvoice = async ({
  stripeCli,
  stripeCusId,
  stripeSubId,
  invoiceItems,
}: {
  stripeCli: Stripe;
  stripeCusId: string;
  stripeSubId: string;
  invoiceItems?: Stripe.InvoiceItemCreateParams[];
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
        invoice: invoice.id,
        customer: stripeCusId,
      });
    }
  }

  let finalInvoice = await stripeCli.invoices.finalizeInvoice(invoice.id, {
    auto_advance: false,
  });

  return { invoice: finalInvoice };
};
