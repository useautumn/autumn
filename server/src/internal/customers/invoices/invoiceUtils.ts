import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "../products/AttachParams.js";
import { InvoiceService, processInvoice } from "./InvoiceService.js";
import Stripe from "stripe";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";

export const attachParamsToInvoice = async ({
  sb,
  attachParams,
  invoiceId,
  stripeInvoice,
  logger,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  invoiceId: string;
  stripeInvoice?: Stripe.Invoice;
  logger: any;
}) => {
  try {
    if (!stripeInvoice) {
      let stripeCli = createStripeCli({
        org: attachParams.org,
        env: attachParams.customer.env,
      });

      stripeInvoice = await getStripeExpandedInvoice({
        stripeCli,
        stripeInvoiceId: invoiceId,
      });
    }

    // Create or update
    let invoice = await InvoiceService.getInvoiceByStripeId({
      sb,
      stripeInvoiceId: invoiceId,
    });

    if (invoice) {
      await InvoiceService.updateByStripeId({
        sb,
        stripeInvoiceId: invoiceId,
        updates: {
          product_ids: attachParams.products.map((p) => p.id),
          internal_product_ids: attachParams.products.map((p) => p.internal_id),
        },
      });
    } else {
      await InvoiceService.createInvoiceFromStripe({
        sb,
        stripeInvoice,
        internalCustomerId: attachParams.customer.internal_id,
        internalEntityId: attachParams.internalEntityId,
        org: attachParams.org,
        productIds: attachParams.products.map((p) => p.id),
        internalProductIds: attachParams.products.map((p) => p.internal_id),
      });
    }
  } catch (error) {
    logger.warn("Failed to insert invoice from attach params");
    logger.warn(error);
  }
};

export const getInvoicesForResponse = async ({
  sb,
  internalCustomerId,
  internalEntityId,
  limit = 20,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalEntityId?: string;
  limit?: number;
}) => {
  let invoices = await InvoiceService.getByInternalCustomerId({
    sb,
    internalCustomerId,
    internalEntityId,
    limit,
  });

  const processedInvoices = invoices.map(processInvoice);

  return processedInvoices;
};
