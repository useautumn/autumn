import RecaseError from "@/utils/errorUtils.js";
import { Entitlement, ErrCode } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes/build/cjs/status-codes.js";

export class EntitlementService {
  static async insert({
    sb,
    data,
  }: {
    sb: SupabaseClient;
    data: Entitlement[] | Entitlement;
  }) {
    const { error } = await sb.from("entitlements").insert(data);

    if (error) {
      throw new RecaseError({
        message: "Failed to create entitlement",
        code: ErrCode.CreateEntitlementFailed,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
  }

  static async upsert({
    sb,
    data,
  }: {
    sb: SupabaseClient;
    data: Entitlement[] | Entitlement;
  }) {
    const { data: entitlement, error } = await sb
      .from("entitlements")
      .upsert(data)
      .select();

    if (error) {
      throw new RecaseError({
        message: "Failed to upsert entitlement",
        code: ErrCode.CreateEntitlementFailed,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
  }

  static async deleteIfNotIn({
    sb,
    productId,
    entitlementIds,
  }: {
    sb: SupabaseClient;
    productId: string;
    entitlementIds: string[];
  }) {
    if (entitlementIds.length === 0) {
      const { error } = await sb
        .from("entitlements")
        .delete()
        .eq("product_id", productId);
      if (error) {
        throw error;
      }
      return;
    }

    const { error } = await sb
      .from("entitlements")
      .delete()
      .not("id", "in", `(${entitlementIds.join(",")})`)
      .eq("product_id", productId);

    if (error) {
      throw error;
    }
  }

  static async getFullEntitlements(
    sb: SupabaseClient,
    entitlementIds: string[]
  ) {
    const { data, error } = await sb
      .from("entitlements")
      .select("*, feature:features(*)")
      .in("id", entitlementIds);

    if (error) {
      throw error;
    }

    return data;
  }

  static async createEntitlement(sb: SupabaseClient, entitlement: Entitlement) {
    const { data, error } = await sb.from("entitlements").insert(entitlement);

    if (error) {
      throw error;
    }

    return data;
  }

  static async deleteEntitlementByProductId(
    sb: SupabaseClient,
    productId: string
  ) {
    await sb.from("entitlements").delete().eq("product_id", productId);
  }

  static async getById(sb: SupabaseClient, entitlementId: string) {
    const { data, error } = await sb
      .from("entitlements")
      .select("*, feature:features(*)")
      .eq("id", entitlementId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }
}
