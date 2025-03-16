import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "../products/AttachParams.js";
import { InvoiceService } from "./InvoiceService.js";
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

    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice,
      internalCustomerId: attachParams.customer.internal_id,
      org: attachParams.org,
      productIds: attachParams.products.map((p) => p.id),
      internalProductIds: attachParams.products.map((p) => p.internal_id),
    });
  } catch (error) {
    logger.warn("Failed to insert invoice from attach params");
    logger.warn(error);
  }
};
