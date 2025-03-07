import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "../products/AttachParams.js";
import { InvoiceService } from "./InvoiceService.js";
import Stripe from "stripe";
import { createStripeCli } from "@/external/stripe/utils.js";

export const attachParamsToInvoice = async ({
  sb,
  attachParams,
  invoiceId,
  stripeInvoice,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  invoiceId: string;
  stripeInvoice?: Stripe.Invoice;
}) => {
  if (!stripeInvoice) {
    let stripeCli = createStripeCli({
      org: attachParams.org,
      env: attachParams.customer.env,
    });

    stripeInvoice = await stripeCli.invoices.retrieve(invoiceId);
  }

  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice,
    internalCustomerId: attachParams.customer.internal_id,
    org: attachParams.org,
    productIds: attachParams.products.map((p) => p.id),
    internalProductIds: attachParams.products.map((p) => p.internal_id),
  });
};
