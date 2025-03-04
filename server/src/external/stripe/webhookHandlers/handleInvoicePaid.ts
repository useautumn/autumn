import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, InvoiceStatus, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const handleOneOffInvoicePaid = async ({
  sb,
  stripeInvoice,
}: {
  sb: SupabaseClient;
  stripeInvoice: Stripe.Invoice;
  event: Stripe.Event;
}) => {
  // Search for invoice
  const invoice = await InvoiceService.getInvoiceByStripeId({
    sb,
    stripeInvoiceId: stripeInvoice.id,
  });

  if (!invoice) {
    console.log(`Invoice not found`);
  }

  // Update invoice status
  await InvoiceService.updateByStripeId({
    sb,
    stripeInvoiceId: stripeInvoice.id,
    updates: {
      status: stripeInvoice.status as InvoiceStatus,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url,
    },
  });

  console.log(`Updated one off invoice status to ${stripeInvoice.status}`);
};
export const handleInvoicePaid = async ({
  req,
  sb,
  org,
  invoice,
  env,
  event,
}: {
  req: any;
  sb: SupabaseClient;
  org: Organization;
  invoice: Stripe.Invoice;
  env: AppEnv;
  event: Stripe.Event;
}) => {
  if (invoice.subscription) {
    // Get customer product
    const activeCusProducts = await CusProductService.getByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
    });

    if (!activeCusProducts || activeCusProducts.length === 0) {
      // TODO: Send alert
      if (invoice.livemode) {
        req.logger.warn(
          `invoice.paid: customer product not found for invoice ${invoice.id}`
        );
        req.logger.warn(`Organization: ${org?.slug}`);
        req.logger.warn(`Invoice subscription: ${invoice.subscription}`);
        req.logger.warn(`Invoice customer: ${invoice.customer}`);
      } else {
        console.log(
          `Skipping invoice.paid: customer product not found for invoice ${invoice.id} (${org.slug}) (non-livemode)`
        );
      }

      return;
    }

    console.log(`Invoice paid handled ${org.slug} ${invoice.id}`);

    let existingInvoice = await InvoiceService.getInvoiceByStripeId({
      sb,
      stripeInvoiceId: invoice.id,
    });

    if (existingInvoice) {
      console.log(`Invoice already exists`);
      await InvoiceService.updateByStripeId({
        sb,
        stripeInvoiceId: invoice.id,
        updates: {
          status: invoice.status as InvoiceStatus,
        },
      });
      console.log(`Updated invoice status to ${invoice.status}`);
      return;
    }

    // console.log("Handling invoice.paid:", invoice.id);

    InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: invoice,
      internalCustomerId: activeCusProducts[0].internal_customer_id,
      productIds: activeCusProducts.map((p) => p.product_id),
      internalProductIds: activeCusProducts.map((p) => p.internal_product_id),
      org: org,
    });
    // const batchUpdate = [];
    // for (const cusProduct of activeCusProducts) {
    //   // Create invoice

    //   batchUpdate.push(

    //   );
    // }

    // await Promise.all(batchUpdate);
  } else {
    await handleOneOffInvoicePaid({
      sb,
      stripeInvoice: invoice,
      event,
    });
  }

  // Else, handle one-off invoice
};
