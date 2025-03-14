import { InvoiceItem, AppEnv, CusProduct } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";

export class InvoiceItemService {
  static async getLatestInvoiceItem({
    sb,
    cusPriceId,
    periodStart,
  }: {
    sb: SupabaseClient;
    cusPriceId: string;
    periodStart: number;
  }) {
    // 1. Fetch latest invoice item
    let { data, error } = await sb
      .from("invoice_items")
      .select("*")
      .eq("customer_price_id", cusPriceId)
      .order("created_at", { ascending: false })
      .gte("period_start", periodStart)
      .limit(1);

    if (error) {
      throw error;
    }

    if (!data || data.length == 0) {
      return null;
    }

    return data[0];
  }

  static async getNotAddedToStripe({
    sb,
    cusPriceId,
  }: {
    sb: SupabaseClient;
    cusPriceId: string;
  }) {
    let { data, error } = await sb
      .from("invoice_items")
      .select("*")
      .eq("customer_price_id", cusPriceId)
      .eq("added_to_stripe", false);

    if (error) {
      throw error;
    }

    if (!data || data.length == 0) {
      return null;
    }

    if (data.length > 1) {
      console.log("❗️ More than one invoice item not added to stripe");
      console.log(data);
    }

    return data[0];
  }

  static async update({
    sb,
    invoiceItemId,
    updates,
  }: {
    sb: SupabaseClient;
    invoiceItemId: string;
    updates: any;
  }) {
    let { data, error } = await sb
      .from("invoice_items")
      .update(updates)
      .eq("id", invoiceItemId);

    if (error) {
      throw error;
    }

    return data;
  }

  static async insert({
    sb,
    data,
  }: {
    sb: SupabaseClient;
    data: InvoiceItem | InvoiceItem[];
  }) {
    let { error } = await sb.from("invoice_items").insert(data);

    if (error) {
      throw error;
    }
  }
}
