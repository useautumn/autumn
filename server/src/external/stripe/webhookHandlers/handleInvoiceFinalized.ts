import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import {
  AppEnv,
  BillingType,
  CusProductStatus,
  InvoiceStatus,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import { differenceInHours, format, subDays } from "date-fns";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import {
  getStripeExpandedInvoice,
  updateInvoiceIfExists,
} from "../stripeInvoiceUtils.js";

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
  if (invoice.subscription) {
    const stripeCli = createStripeCli({ org, env });
    const expandedInvoice = await getStripeExpandedInvoice({
      stripeCli,
      stripeInvoiceId: invoice.id,
    });

    const activeProducts = await CusProductService.getByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
      inStatuses: [CusProductStatus.Active],
    });
    if (activeProducts.length === 0) {
      console.log("invoice.finalized: No active products found");
      return;
    }

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
      stripeInvoice: expandedInvoice,
      internalCustomerId: activeProducts[0].internal_customer_id,
      productIds: activeProducts.map((p) => p.product.id),
      internalProductIds: activeProducts.map((p) => p.internal_product_id),
      status: invoice.status as InvoiceStatus,
      org,
    });
  }
};
