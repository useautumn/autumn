import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import {
  AppEnv,
  BillingType,
  InvoiceStatus,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import { differenceInHours, format, subDays } from "date-fns";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { updateInvoiceIfExists } from "../stripeInvoiceUtils.js";

export const handleInvoiceFinalized = async ({
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
  // Get stripe subscriptions
  if (invoice.subscription) {
    const activeProducts = await CusProductService.getActiveByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
    });

    if (activeProducts.length != 1) {
      console.log(
        "Invalid number of active products for invoice.finalized: ",
        activeProducts.length
      );
      return;
    }

    const activeProduct = activeProducts[0];

    const updated = await updateInvoiceIfExists({
      sb,
      invoice,
    });

    if (updated) {
      return;
    }

    // Create invoice if not exists...?
    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: invoice,
      internalCustomerId: activeProduct.internal_customer_id,
      productIds: [activeProduct.product.id],
      internalProductIds: [activeProduct.internal_product_id],
      status: invoice.status as InvoiceStatus,
      org,
    });
  }
};
