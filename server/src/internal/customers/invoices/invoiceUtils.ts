import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "../products/AttachParams.js";
import { InvoiceService, processInvoice } from "./InvoiceService.js";
import Stripe from "stripe";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import {
  Feature,
  Invoice,
  InvoiceItem,
  Price,
  PriceType,
  UsagePriceConfig,
} from "@autumn/shared";

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

    // Create or update
    let invoice = await InvoiceService.getInvoiceByStripeId({
      sb,
      stripeInvoiceId: invoiceId,
    });

    if (invoice) {
      await InvoiceService.updateByStripeId({
        sb,
        stripeInvoiceId: invoiceId,
        updates: {
          product_ids: attachParams.products.map((p) => p.id),
          internal_product_ids: attachParams.products.map((p) => p.internal_id),
        },
      });
    } else {
      await InvoiceService.createInvoiceFromStripe({
        sb,
        stripeInvoice,
        internalCustomerId: attachParams.customer.internal_id,
        internalEntityId: attachParams.internalEntityId,
        org: attachParams.org,
        productIds: attachParams.products.map((p) => p.id),
        internalProductIds: attachParams.products.map((p) => p.internal_id),
      });
    }
  } catch (error) {
    logger.warn("Failed to insert invoice from attach params");
    logger.warn(error);
  }
};

export const invoicesToResponse = ({
  invoices,
  logger,
}: {
  invoices: Invoice[];
  logger: any;
}) => {
  return invoices.map((i) =>
    processInvoice({
      invoice: i,
      withItems: false,
      features: [],
    })
  );
};

export const getInvoicesForResponse = async ({
  sb,

  internalCustomerId,
  internalEntityId,
  limit = 20,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalEntityId?: string;
  limit?: number;
}) => {
  let invoices = await InvoiceService.getByInternalCustomerId({
    sb,
    internalCustomerId,
    internalEntityId,
    limit,
  });

  const processedInvoices = invoices.map((i) =>
    processInvoice({
      invoice: i,
      withItems: false,
      features: [],
    })
  );

  return processedInvoices;
};

export const getInvoiceItems = async ({
  stripeInvoice,
  prices,
  logger,
}: {
  stripeInvoice: Stripe.Invoice;
  prices: Price[];
  logger: any;
}) => {
  let invoiceItems: InvoiceItem[] = [];

  try {
    for (const line of stripeInvoice.lines.data) {
      let price = prices.find(
        (p) => p.config?.stripe_price_id === line.price?.id
      );

      if (!price) {
        continue;
      }

      let usageConfig = price.config as UsagePriceConfig;
      invoiceItems.push({
        price_id: price.id!,
        stripe_id: line.id,
        internal_feature_id: usageConfig.internal_feature_id || null,
        description: line.description || "",
        period_start: line.period.start * 1000,
        period_end: line.period.end * 1000,
      });
    }
  } catch (error) {
    logger.error(
      `Failed to get invoice items for invoice ${stripeInvoice.id}`,
      error
    );
    return [];
  }

  return invoiceItems;
};
