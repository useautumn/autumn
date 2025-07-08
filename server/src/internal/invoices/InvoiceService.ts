import {
  Feature,
  Invoice,
  InvoiceItem,
  InvoiceItemResponseSchema,
  InvoiceResponse,
  InvoiceStatus,
  LoggerAction,
  Organization,
} from "@autumn/shared";
import Stripe from "stripe";
import { generateId } from "@/utils/genUtils.js";

import { getInvoiceDiscounts } from "@/external/stripe/stripeInvoiceUtils.js";
import { Autumn } from "autumn-js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { invoices } from "@autumn/shared";
import { and, desc, eq } from "drizzle-orm";

export const processInvoice = ({
  invoice,
  withItems = false,
  features,
}: {
  invoice: Invoice;
  withItems?: boolean;
  features?: Feature[];
}) => {
  return {
    product_ids: invoice.product_ids,
    stripe_id: invoice.stripe_id,
    status: invoice.status,
    total: invoice.total,
    currency: invoice.currency,
    created_at: invoice.created_at,
    hosted_invoice_url: invoice.hosted_invoice_url,
    items: withItems
      ? (invoice.items || []).map((i) => {
          let feature = features?.find(
            (f) => f.internal_id === i.internal_feature_id,
          );

          return InvoiceItemResponseSchema.parse({
            description: i.description,
            period_start: i.period_start,
            period_end: i.period_end,
            feature_id: feature?.id,
            feature_name: feature?.name,
          });
        })
      : undefined,
  } as InvoiceResponse;
};

export class InvoiceService {
  static async list({
    db,
    internalCustomerId,
    internalEntityId,
    limit = 100,
  }: {
    db: DrizzleCli;
    internalCustomerId: string;
    internalEntityId?: string;
    limit?: number;
  }) {
    return (await db.query.invoices.findMany({
      where: and(
        eq(invoices.internal_customer_id, internalCustomerId),
        internalEntityId
          ? eq(invoices.internal_entity_id, internalEntityId)
          : undefined,
      ),
      orderBy: [desc(invoices.created_at)],
      limit,
    })) as Invoice[];
  }

  static async getByStripeId({
    db,
    stripeId,
  }: {
    db: DrizzleCli;
    stripeId: string;
  }) {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.stripe_id, stripeId),
    });

    if (!invoice) {
      return null;
    }

    return invoice as Invoice;
  }

  static async createInvoiceFromStripe({
    db,
    stripeInvoice,
    internalCustomerId,
    internalEntityId,
    productIds,
    internalProductIds,
    status,
    org,
    sendRevenueEvent = true,
    items = [],
  }: {
    db: DrizzleCli;
    stripeInvoice: Stripe.Invoice;
    internalCustomerId: string;
    internalEntityId?: string | null;
    productIds: string[];
    internalProductIds: string[];
    status?: InvoiceStatus | null;
    org: Organization;
    sendRevenueEvent?: boolean;
    items?: InvoiceItem[];
  }) {
    // Convert product ids to unique product ids
    const uniqueProductIds = [...new Set(productIds)];
    const uniqueInternalProductIds = [...new Set(internalProductIds)];
    let total = stripeInvoice.total / 100;

    if (stripeInvoice.currency.toLowerCase() == "clp") {
      total = stripeInvoice.total;
    }

    const invoice: Invoice = {
      id: generateId("inv"),
      internal_customer_id: internalCustomerId,
      product_ids: uniqueProductIds,
      created_at: stripeInvoice.created * 1000,
      stripe_id: stripeInvoice.id,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
      status: status || (stripeInvoice.status as InvoiceStatus | null),
      internal_product_ids: uniqueInternalProductIds,
      internal_entity_id: internalEntityId || null,

      // Stripe stuff
      total,
      currency: stripeInvoice.currency,
      discounts: getInvoiceDiscounts({
        expandedInvoice: stripeInvoice,
      }),

      items: items,
    };

    try {
      await db.insert(invoices).values(invoice as any);
    } catch (error: any) {
      if (error.code == "23505") {
        console.log("   🧐 Invoice already exists");
        return;
      } else {
        console.error("   ❌ Error inserting Stripe invoice: ", error);
        throw error;
      }
    }

    // Send monthly_revenue event
    try {
      if (!stripeInvoice.livemode || !sendRevenueEvent) {
        return;
      }

      const autumn = new Autumn();
      await autumn.track({
        customer_id: org.id,
        event_name: "revenue",
        value: Math.round(stripeInvoice.total / 100),
        customer_data: {
          name: org.slug,
        },
      });
      console.log("   ✅ Sent revenue event");
    } catch (error) {
      console.log("Failed to send revenue event", error);
    }
  }

  static async updateByStripeId({
    db,
    stripeId,
    updates,
  }: {
    db: DrizzleCli;
    stripeId: string;
    updates: Partial<Invoice>;
  }) {
    const results = await db
      .update(invoices)
      .set(updates as any)
      .where(eq(invoices.stripe_id, stripeId))
      .returning();

    if (results.length === 0) {
      return null;
    }

    return results[0] as Invoice;
  }
}
