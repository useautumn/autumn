import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CusProduct,
  CusProductStatus,
  ProcessorType,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class CusProductService {
  static async createCusProduct({
    sb,
    customerProduct,
  }: {
    sb: SupabaseClient;
    customerProduct: CusProduct;
  }) {
    const { error } = await sb
      .from("customer_products")
      .insert(customerProduct);

    if (error) {
      throw error;
    }

    return customerProduct;
  }

  static async getFullCusProduct({
    sb,
    cusProductId,
  }: {
    sb: SupabaseClient;
    cusProductId: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select(
        `
        *, customer_entitlements:customer_entitlements!inner(*, entitlement:entitlements!inner(*, feature:features!inner(*))), customer_prices:customer_prices!inner(*, price:prices!inner(*)), customer:customers!inner(*), product:products!inner(*)
      `
      )
      .eq("id", cusProductId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getByInternalCusId({
    sb,
    cusId,
  }: {
    sb: SupabaseClient;
    cusId: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:product_id(*)")
      .eq("internal_customer_id", cusId);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getCurrentProductByGroup({
    sb,
    internalCustomerId,
    productGroup,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    productGroup: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:products!inner(*)")
      .eq("internal_customer_id", internalCustomerId)
      .eq("product.group", productGroup)
      .eq("product.is_add_on", false)
      .neq("status", CusProductStatus.Expired)
      .neq("status", CusProductStatus.Scheduled)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async getByCusAndProductId({
    sb,
    customerId,
    productId,
    orgId,
  }: {
    sb: SupabaseClient;
    customerId: string;
    productId: string;
    orgId: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*")
      .eq("org_id", orgId)
      .eq("customer_id", customerId)
      .eq("product_id", productId);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getByProductId(sb: SupabaseClient, internalProductId: string) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*")
      .eq("internal_product_id", internalProductId);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getActiveByStripeSubId({
    sb,
    stripeSubId,
  }: {
    sb: SupabaseClient;
    stripeSubId: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:products(*), customer:customers(*)")
      .eq("processor->>subscription_id", stripeSubId)
      .neq("status", CusProductStatus.Expired)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async getPastDueByInvoiceId({
    sb,
    invoiceId,
  }: {
    sb: SupabaseClient;
    invoiceId: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*")
      .eq("processor->>last_invoice_id", invoiceId)
      .eq("status", CusProductStatus.PastDue)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async getByScheduleId({
    sb,
    scheduleId,
  }: {
    sb: SupabaseClient;
    scheduleId: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:products!inner(*)")
      .eq("processor->>subscription_schedule_id", scheduleId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async getFutureProduct({
    sb,
    internalCustomerId,
    productGroup,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    productGroup: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:products!inner(*)")
      .eq("internal_customer_id", internalCustomerId)
      .eq("product.group", productGroup)
      .eq("status", CusProductStatus.Scheduled)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async getByCustomerId({
    sb,
    customerId,
    inStatuses,
  }: {
    sb: SupabaseClient;
    customerId: string;
    inStatuses?: string[];
  }) {
    const query = sb
      .from("customer_products")
      .select("*, customer:customers!inner(*), product:products!inner(*)")
      .eq("customer_id", customerId);

    if (inStatuses) {
      query.in("status", inStatuses);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  static async getFullByCustomerId({
    sb,
    customerId,
    orgId,
    env,
    inStatuses,
  }: {
    sb: SupabaseClient;
    customerId: string;
    orgId: string;
    env: AppEnv;
    inStatuses?: string[];
  }) {
    const query = sb
      .from("customer_products")
      .select(
        `*, product:products!inner(*), customer:customers!inner(*), 
        customer_entitlements:customer_entitlements!inner(*, entitlement:entitlements!inner(*, feature:features!inner(*))), 
        customer_prices:customer_prices!inner(*, price:prices!inner(*))
      `
      )
      .eq("customer.id", customerId)
      .eq("customer.org_id", orgId)
      .eq("customer.env", env);

    if (inStatuses) {
      query.in("status", inStatuses);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  static async updateStatusByStripeSubId({
    sb,
    stripeSubId,
    status,
  }: {
    sb: SupabaseClient;
    stripeSubId: string;
    status: string;
  }) {
    const { data: updated, error } = await sb
      .from("customer_products")
      .update({
        status,
      })
      .eq("processor->>subscription_id", stripeSubId)
      .neq("status", status)
      .neq("status", CusProductStatus.Expired)
      .select();

    if (error) {
      throw error;
    }

    if (updated.length === 0) {
      return null;
    }

    return updated[0];
  }

  static async update({
    sb,
    cusProductId,
    updates,
  }: {
    sb: SupabaseClient;
    cusProductId: string;
    updates: Partial<CusProduct>;
  }) {
    const { error } = await sb
      .from("customer_products")
      .update(updates)
      .eq("id", cusProductId);

    if (error) {
      throw new RecaseError({
        message: "Error updating customer product status",
        code: ErrCode.UpdateCusProductFailed,
        statusCode: 500,
        data: error,
      });
    }
  }

  static async updateByStripeSubId({
    sb,
    stripeSubId,
    updates,
  }: {
    sb: SupabaseClient;
    stripeSubId: string;
    updates: Partial<CusProduct>;
  }) {
    const { data: updated, error } = await sb
      .from("customer_products")
      .update(updates)
      // .eq("status", CusProductStatus.Active)
      .eq("processor->>subscription_id", stripeSubId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return updated;
  }

  static async expireCurrentProduct({
    sb,
    internalCustomerId,
    productGroup,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    productGroup: string;
  }) {
    // TO WORK ON EXPIRING
    const currentProduct = await this.getCurrentProductByGroup({
      sb,
      internalCustomerId,
      productGroup,
    });

    if (!currentProduct) {
      return;
    }

    console.log(`Expiring current product: ${currentProduct.product.name}`);
    await this.update({
      sb,
      cusProductId: currentProduct.id,
      updates: {
        status: CusProductStatus.Expired,
        ended_at: Date.now(),
      },
    });

    return;
  }

  static async activateFutureProduct({
    sb,
    internalCustomerId,
    productGroup,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    productGroup: string;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .update({
        status: CusProductStatus.Active,
      })
      .eq("internal_customer_id", internalCustomerId)
      .eq("product.group", productGroup)
      .eq("status", CusProductStatus.Scheduled)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  // DELETE

  static async deleteFutureProduct({
    sb,
    internalCustomerId,
    productGroup,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    productGroup: string;
  }) {
    // 1. Get all products in same group
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:products!inner(*)")
      .eq("internal_customer_id", internalCustomerId)
      .eq("product.group", productGroup)
      .eq("status", CusProductStatus.Scheduled);

    if (!data || data.length === 0) {
      return null;
    }

    // Delete product
    const { error: deleteError } = await sb
      .from("customer_products")
      .delete()
      .eq("id", data[0].id)
      .select()
      .single();

    if (deleteError) {
      if (deleteError.code === "PGRST116") {
        return null;
      }
      throw deleteError;
    }

    return data[0];
  }
}
