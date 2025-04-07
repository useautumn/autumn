import { CusProductStatus } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

export class CusProdReadService {
  static getCounts = async ({
    sb,
    internalProductId,
  }: {
    sb: SupabaseClient;
    internalProductId: string;
  }) => {
    let { data: result, error } = await sb.rpc("get_product_stats", {
      p_internal_id: internalProductId,
    });

    if (error) {
      console.error("Error getting counts", error);
      throw error;
    }

    return {
      active: result.f1,
      canceled: result.f2,
      custom: result.f3,
      trialing: result.f4,
    };
  };
  // Get count of active cus products by product id
  static async getCountByInternalProductId({
    sb,
    orgId,
    env,
    internalProductId,
    inStatuses,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: string;
    internalProductId: string;
    inStatuses?: string[];
  }) {
    let query = sb
      .from("customer_products")
      .select("*, product:products!inner(*)", { count: "exact", head: true })
      .eq("product.org_id", orgId)
      .eq("product.env", env)
      .eq("internal_product_id", internalProductId);

    if (inStatuses) {
      query = query.in("status", inStatuses);
    }

    const { count, error } = await query;

    if (error) {
      throw error;
    }

    return count || 0;
  }

  static async getCanceledCountByInternalProductId({
    sb,
    orgId,
    env,
    internalProductId,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: string;
    internalProductId: string;
  }) {
    const { count, error } = await sb
      .from("customer_products")
      .select("*", { count: "exact", head: true })
      .eq("internal_product_id", internalProductId)
      .eq("status", CusProductStatus.Active)
      .not("canceled_at", "is", null);

    if (error) {
      console.error("Error getting canceled count", error);
      throw error;
    }

    return count || 0;
  }

  static async getCustomCountByInternalProductId({
    sb,
    internalProductId,
  }: {
    sb: SupabaseClient;
    internalProductId: string;
  }) {
    const { count, error } = await sb
      .from("customer_products")
      .select("*", { count: "exact", head: true })
      .eq("internal_product_id", internalProductId)
      .eq("is_custom", true);

    if (error) {
      console.error("Error getting custom count", error);
      throw error;
    }

    return count || 0;
  }

  static async getTrialingCount({
    sb,
    internalProductId,
  }: {
    sb: SupabaseClient;
    internalProductId: string;
  }) {
    const { count, error } = await sb
      .from("customer_products")
      .select("*", { count: "exact", head: true })
      .eq("internal_product_id", internalProductId)
      .eq("status", CusProductStatus.Active)
      .gt("trial_ends_at", Date.now());

    if (error) {
      console.error("Error getting trialing count", error);
      throw error;
    }

    return count || 0;
  }
}
