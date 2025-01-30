import { SupabaseClient } from "@supabase/supabase-js";
import {
  AppEnv,
  Invoice,
  InvoiceStatus,
  Organization,
  ProcessorType,
} from "@autumn/shared";
import Stripe from "stripe";
import { generateId } from "@/utils/genUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { CusService } from "../CusService.js";

export class InvoiceService {
  static async createInvoice({
    sb,
    invoice,
  }: {
    sb: SupabaseClient;
    invoice: Invoice;
  }) {
    const { error } = await sb.from("invoices").insert(invoice);
    if (error) {
      throw error;
    }
  }

  static async getInvoices({
    sb,
    internalCustomerId,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
  }) {
    const { data, error } = await sb
      .from("invoices")
      .select("*")
      .eq("internal_customer_id", internalCustomerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }
    return data;
  }

  static async getInvoiceByStripeId({
    sb,
    stripeInvoiceId,
  }: {
    sb: SupabaseClient;
    stripeInvoiceId: string;
  }) {
    const { data, error } = await sb
      .from("invoices")
      .select("*")
      .eq("stripe_id", stripeInvoiceId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }
    return data;
  }

  static async createInvoiceFromStripe({
    sb,
    stripeInvoice,
    internalCustomerId,
    productIds,
    status,
    org,
  }: {
    sb: SupabaseClient;
    stripeInvoice: Stripe.Invoice;
    internalCustomerId: string;
    productIds: string[];
    status?: InvoiceStatus | null;
    org: Organization;
  }) {
    const invoice: Invoice = {
      id: generateId("inv"),
      internal_customer_id: internalCustomerId,
      product_ids: productIds,
      created_at: stripeInvoice.created * 1000,
      stripe_id: stripeInvoice.id,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
      status: status || (stripeInvoice.status as InvoiceStatus | null),
    };

    const { error } = await sb.from("invoices").insert(invoice);

    if (error) {
      console.log("Failed to create invoice from stripe", error.message);
      return;
    }

    console.log("✅ Created invoice from stripe");

    // Send monthly_revenue event
    try {
      const customer = await CusService.getByInternalId({
        sb,
        internalId: invoice.internal_customer_id,
      });

      if (customer.env !== AppEnv.Live) {
        return;
      }

      const autumn = new Autumn();
      await autumn.sendEvent({
        customerId: org.id,
        eventName: "monthly_revenue",
        properties: {
          value: stripeInvoice.total / 100,
        },
        customer_data: {
          name: org.slug,
        },
      });
      console.log("✅ Sent monthly_revenue event");
    } catch (error) {
      console.log("Failed to send monthly_revenue event", error);
    }
  }
}

// // Check if invoice already exists
// // TODO: Fix This
// const existingInvoice = await this.getInvoiceByStripeId({
//   sb,
//   stripeInvoiceId: stripeInvoice.id,
// });

// if (existingInvoice) {
//   console.log("Invoice already exists");
//   return;
// }

// // const { error } = await sb
// //   .from("invoices")
// //   .upsert(invoice, {
// //     onConflict: "stripe_id",
// //   })
// //   .select();
