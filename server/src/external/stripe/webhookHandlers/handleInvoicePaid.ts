import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { AppEnv, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import chalk from "chalk";
import Stripe from "stripe";

export const handleInvoicePaid = async ({
  sb,
  org,
  invoice,
  env,
  event,
}: {
  sb: SupabaseClient;
  org: Organization;
  invoice: Stripe.Invoice;
  env: AppEnv;
  event: Stripe.Event;
}) => {
  if (invoice.subscription) {
    // Get customer product
    const cusProduct = await CusProductService.getActiveByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
    });

    if (!cusProduct) {
      // TODO: Send alert
      console.log(
        `   ERROR | ${chalk.red("❌")} invoice.paid: customer product not found`
      );
      console.log(
        `   Event ID: ${event.id}, Subscription ID: ${invoice.subscription}, Org ID: ${org.id}, Env: ${env}`
      );
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
      internalProductIds: [cusProduct.internal_product_id],
      org: org,
    });
    return;
  }
};
