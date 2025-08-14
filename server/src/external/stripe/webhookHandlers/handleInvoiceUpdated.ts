import { AppEnv, InvoiceStatus } from "@autumn/shared";
import Stripe from "stripe";
import { getFullStripeInvoice } from "../stripeInvoiceUtils.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";

export const handleInvoiceUpdated = async ({
  env,
  event,
  stripeCli,
  req,
}: {
  env: AppEnv;
  event: Stripe.Event;
  stripeCli: Stripe;
  req: any;
}) => {
  const invoiceObject = event.data.object as Stripe.Invoice;
  const invoice = await getFullStripeInvoice({
    stripeCli,
    stripeId: invoiceObject.id,
  });

  const prevAttributes = event.data.previous_attributes as any;
  const invoiceVoided =
    prevAttributes?.status !== "void" && invoice.status === "void";

  const { logger } = req;

  if (invoiceVoided) {
    logger.info(`Invoice has been voided!`);
    await InvoiceService.updateByStripeId({
      db: req.db,
      stripeId: invoiceObject.id,
      updates: {
        status: InvoiceStatus.Void,
      },
    });
  }
};
