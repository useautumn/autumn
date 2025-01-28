import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const handleInvoicePaid = async ({
  sb,
  org,
  invoice,
  event,
}: {
  sb: SupabaseClient;
  org: Organization;
  invoice: Stripe.Invoice;
  event: Stripe.Event;
}) => {
  if (invoice.subscription) {
    // Get customer product
    const cusProduct = await CusProductService.getActiveByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
    });

    if (!cusProduct) {
      return;
    }

    let existingInvoice = await InvoiceService.getInvoiceByStripeId({
      sb,
      stripeInvoiceId: invoice.id,
    });

    if (existingInvoice) {
      console.log(`Invoice already exists`);
      return;
    }

    // Create invoice
    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: invoice,
      internalCustomerId: cusProduct.internal_customer_id,
      productIds: [cusProduct.product_id],
    });
    console.log(`Successfully created invoice`);
    return;
  }

  // console.log("Threshold invoice:", invoice.id);
  // const cusProduct = await CusProductService.getPastDueByInvoiceId({
  //   sb,
  //   invoiceId: invoice.id,
  // });

  // console.log("Customer product:", cusProduct);
};
