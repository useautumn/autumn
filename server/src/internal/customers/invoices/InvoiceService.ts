import { SupabaseClient } from "@supabase/supabase-js";
import { Invoice, ProcessorType } from "@autumn/shared";
import Stripe from "stripe";
import { generateId } from "@/utils/genUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

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
      .eq("processor->>id", stripeInvoiceId)
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
  }: {
    sb: SupabaseClient;
    stripeInvoice: Stripe.Invoice;
    internalCustomerId: string;
    productIds: string[];
  }) {
    const invoice: Invoice = {
      id: generateId("inv"),
      internal_customer_id: internalCustomerId,
      product_ids: productIds,
      created_at: stripeInvoice.created * 1000,
      processor: {
        id: stripeInvoice.id,
        type: ProcessorType.Stripe,
        hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
      },
    };

    // Check if invoice already exists
    // TODO: Fix This
    const existingInvoice = await this.getInvoiceByStripeId({
      sb,
      stripeInvoiceId: stripeInvoice.id,
    });

    if (existingInvoice) {
      return;
    }

    const { error } = await sb.from("invoices").insert(invoice);

    if (error) {
      console.log("Failed to create invoice from stripe", error);
      throw new RecaseError({
        code: ErrCode.CreateInvoiceFailed,
        message: error.message,
      });
    }
  }
}
