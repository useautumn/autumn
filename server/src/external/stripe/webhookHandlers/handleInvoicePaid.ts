import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

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
    const activeCusProducts = await CusProductService.getActiveByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
    });

    if (
      !activeCusProducts ||
      (activeCusProducts.length === 0 && invoice.livemode)
    ) {
      // TODO: Send alert
      req.logger.warn(
        `invoice.paid: customer product not found for invoice ${invoice.id}`
      );
      req.logger.warn(`Invoice subscription: ${invoice.subscription}`);
      req.logger.warn(`Invoice customer: ${invoice.customer}`);

      // throw new RecaseError({
      //   message: `invoice.paid: customer product not found`,
      //   code: "invoice_paid_customer_product_not_found",
      //   statusCode: 200,
      //   data: {
      //     stripeInvoiceId: invoice.id,
      //     stripeSubscriptionId: invoice.subscription,
      //     stripeEventId: event.id,
      //     stripeCustomerId: invoice.customer as string,
      //     orgId: org.id,
      //     env,
      //   },
      // });

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

    // console.log("Handling invoice.paid:", invoice.id);

    const batchUpdate = [];
    for (const cusProduct of activeCusProducts) {
      // Create invoice

      batchUpdate.push(
        InvoiceService.createInvoiceFromStripe({
          sb,
          stripeInvoice: invoice,
          internalCustomerId: cusProduct.internal_customer_id,
          productIds: [cusProduct.product_id],
          internalProductIds: [cusProduct.internal_product_id],
          org: org,
        })
      );
    }

    await Promise.all(batchUpdate);
  }
};
