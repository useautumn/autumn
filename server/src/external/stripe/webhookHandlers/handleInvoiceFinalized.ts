import { CusProductService } from "@/internal/customers/products/CusProductService.js";

import {
  AppEnv,
  CusProductStatus,
  FullCustomerPrice,
  InvoiceStatus,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";

import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import {
  getStripeExpandedInvoice,
  updateInvoiceIfExists,
} from "../stripeInvoiceUtils.js";
import { getInvoiceItems } from "@/internal/customers/invoices/invoiceUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const handleInvoiceFinalized = async ({
  db,
  sb,
  org,
  invoice,
  env,
  event,
  logger,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  org: Organization;
  invoice: Stripe.Invoice;
  env: AppEnv;
  event: Stripe.Event;
  logger: any;
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
      withCusPrices: true,
      withCusEnts: true,
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

    let prices = activeProducts.flatMap((cp) =>
      cp.customer_prices.map((cpr: FullCustomerPrice) => cpr.price),
    );

    let invoiceItems = await getInvoiceItems({
      stripeInvoice: invoice,
      prices: prices,
      logger,
    });

    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: expandedInvoice,
      internalCustomerId: activeProducts[0].internal_customer_id,
      productIds: activeProducts.map((p) => p.product.id),
      internalProductIds: activeProducts.map((p) => p.internal_product_id),
      internalEntityId: activeProducts[0].internal_entity_id,
      status: invoice.status as InvoiceStatus,
      org,
      items: invoiceItems,
    });
  }
};
