import {
  AppEnv,
  CusProductStatus,
  FullCustomerPrice,
  InvoiceStatus,
  Organization,
} from "@autumn/shared";

import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  getFullStripeInvoice,
  getStripeExpandedInvoice,
  updateInvoiceIfExists,
} from "../stripeInvoiceUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";

export const handleInvoiceFinalized = async ({
  db,
  org,
  data,
  env,
  logger,
}: {
  db: DrizzleCli;
  org: Organization;
  data: Stripe.Invoice;
  env: AppEnv;
  logger: any;
}) => {
  const stripeCli = createStripeCli({ org, env });
  const invoice = await getFullStripeInvoice({
    stripeCli,
    stripeId: data.id,
  });

  if (invoice.subscription) {
    const stripeCli = createStripeCli({ org, env });
    const expandedInvoice = await getStripeExpandedInvoice({
      stripeCli,
      stripeInvoiceId: invoice.id,
    });

    const activeProducts = await CusProductService.getByStripeSubId({
      db,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
      inStatuses: [CusProductStatus.Active],
    });

    if (activeProducts.length === 0) {
      return;
    }

    const updated = await updateInvoiceIfExists({
      db,
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
      db,
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
