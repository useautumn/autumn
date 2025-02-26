import { ErrCode } from "@/errors/errCodes.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CusProduct,
  CusProductStatus,
  Organization,
  ProcessorType,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE_STATUSES = [
  CusProductStatus.Active,
  CusProductStatus.Scheduled,
  // CusProductStatus.PastDue,
];

export class CusProductService {
  static async getByIdStrict({
    sb,
    id,
    orgId,
    env,
    withProduct = false,
  }: {
    sb: SupabaseClient;
    id: string;
    orgId: string;
    env: AppEnv;
    withProduct?: boolean;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select(`*, customer:customers!inner(*), product:products!inner(*)`)
      .eq("id", id)
      .eq("customer.org_id", orgId)
      .eq("customer.env", env)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }
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
    inStatuses,
    productGroup,
  }: {
    sb: SupabaseClient;
    cusId: string;
    inStatuses?: string[];
    productGroup?: string;
  }) {
    const query = sb
      .from("customer_products")
      .select("*, product:products!inner(*)")
      .eq("internal_customer_id", cusId);

    if (inStatuses) {
      query.in("status", inStatuses);
    }

    if (productGroup) {
      query.eq("product.group", productGroup);
    }

    const { data, error } = await query;

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
      .select(
        `
        *, 
        product:products!inner(*, prices(*)),
        customer_prices:customer_prices(*, price:prices!inner(*)),
        customer_entitlements:customer_entitlements!inner(*, entitlement:entitlements!inner(*, feature:features!inner(*))),
        customer:customers!inner(*)
      `
      )
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
      .eq("internal_product_id", internalProductId)
      .limit(1);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getByStripeSubId({
    sb,
    stripeSubId,
    orgId,
    env,
    inStatuses,
  }: {
    sb: SupabaseClient;
    stripeSubId: string;
    orgId: string;
    env: AppEnv;
    inStatuses?: string[];
  }) {
    const query = sb
      .from("customer_products")
      .select("*, product:products(*), customer:customers!inner(*)")
      .or(
        `processor->>'subscription_id'.eq.'${stripeSubId}', subscription_ids.cs.{${stripeSubId}}`
      )
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

  static async getByStripeScheduledId({
    sb,
    stripeScheduledId,
    orgId,
    env,
    inStatuses,
  }: {
    sb: SupabaseClient;
    stripeScheduledId: string;
    orgId: string;
    env: AppEnv;
    inStatuses?: string[];
  }) {
    const query = sb
      .from("customer_products")
      .select("*, product:products(*), customer:customers!inner(*)")
      .or(
        `processor->>'subscription_schedule_id'.eq.'${stripeScheduledId}', scheduled_ids.cs.{${stripeScheduledId}}`
      )
      .eq("customer.org_id", orgId)
      .eq("customer.env", env);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  static async getEntsAndPrices({
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
          *, 
          customer_entitlements:customer_entitlements!inner(*, entitlement:entitlements!inner(*)), 
          customer_prices:customer_prices!inner(*, price:prices!inner(*))
        `
      )
      .eq("id", cusProductId)
      .single();

    if (error) {
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
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    scheduleId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:products!inner(*), customer:customers!inner(*)")
      // .eq("processor->>subscription_schedule_id", scheduleId)
      .contains("scheduled_ids", [scheduleId])
      .eq("customer.org_id", orgId)
      .eq("customer.env", env);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    }

    if (data.length > 1) {
      throw new RecaseError({
        message: `Multiple cus products found for schedule id: ${scheduleId}`,
        code: ErrCode.MultipleProductsFound,
        statusCode: 500,
      });
    }

    return data[0];
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
        `*, product:products!inner(*), 
        customer:customers!inner(*),
        customer_entitlements:customer_entitlements!inner(
          *, entitlement:entitlements!inner(
            *, feature:features!inner(*)
          )
        ),
        customer_prices:customer_prices(
          *, price:prices(*)
        )
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

  static async updateStrict({
    sb,
    cusProductId,
    orgId,
    env,
    updates,
  }: {
    sb: SupabaseClient;
    cusProductId: string;
    orgId: string;
    env: AppEnv;
    updates: Partial<CusProduct>;
  }) {
    const { error } = await sb
      .from("customer_products")
      .update(updates)
      .eq("id", cusProductId)
      .eq("customer.org_id", orgId)
      .eq("customer.env", env);

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

    console.log(
      `   - updating cusProduct status to expired: ${currentProduct.product.name}`
    );
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
    org,
    env,
  }: {
    sb: SupabaseClient;
    org: Organization;
    env: AppEnv;
    internalCustomerId: string;
    productGroup: string;
  }) {
    // // 1. Get all products in same group
    const { data, error } = await sb
      .from("customer_products")
      .select("*, product:products!inner(*)")
      .eq("internal_customer_id", internalCustomerId)
      .eq("product.group", productGroup)
      .in("status", [CusProductStatus.Scheduled]);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    }

    let scheduledProduct = data[0];

    // Handle scheduled product
    const stripeCli = createStripeCli({
      org,
      env,
    });

    if (scheduledProduct) {
      let batchCancelSchedule = [];

      if (
        scheduledProduct.scheduled_ids &&
        scheduledProduct.scheduled_ids.length > 0
      ) {
        let scheduleIds = scheduledProduct.scheduled_ids;
        const cancelSchedule = async (scheduleId: string) => {
          try {
            await stripeCli.subscriptionSchedules.cancel(scheduleId);
          } catch (error: any) {
            console.log(
              `   - failed to cancel stripe schedule: ${scheduleId}, product: ${scheduledProduct.product.name}, org: ${org.slug}`,
              error.message
            );
          }
        };
        for (const scheduleId of scheduleIds) {
          batchCancelSchedule.push(cancelSchedule(scheduleId));
        }
        await Promise.all(batchCancelSchedule);
      }

      await sb.from("customer_products").delete().eq("id", scheduledProduct.id);
    }

    return scheduledProduct;
  }

  static async delete({
    sb,
    cusProductId,
  }: {
    sb: SupabaseClient;
    cusProductId: string;
  }) {
    const { error } = await sb
      .from("customer_products")
      .delete()
      .eq("id", cusProductId);

    if (error) {
      throw error;
    }
  }
}
