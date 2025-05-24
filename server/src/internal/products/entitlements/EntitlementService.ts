import { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  EntInsertSchema,
  Entitlement,
  entitlements,
  ErrCode,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes/build/cjs/status-codes.js";

export class EntitlementService {
  static async insert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: Entitlement[] | Entitlement;
  }) {
    if (Array.isArray(data) && data.length == 0) {
      return;
    }

    return await db.insert(entitlements).values(data as any); // DRIZZLE TYPE REFACTOR
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

  static async getFullEntitlements({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("entitlements")
      .select("*, feature:features!inner(*)")
      .eq("feature.org_id", orgId)
      .eq("feature.env", env);

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

  static async deleteEntitlementByProductId(
    sb: SupabaseClient,
    internalProductId: string,
  ) {
    await sb
      .from("entitlements")
      .delete()
      .eq("internal_product_id", internalProductId);
  }

  static async deleteByIds({
    sb,
    entitlementIds,
  }: {
    sb: SupabaseClient;
    entitlementIds: string[];
  }) {
    const { error } = await sb
      .from("entitlements")
      .delete()
      .in("id", entitlementIds);

    if (error) {
      throw new RecaseError({
        message: "Failed to delete entitlement(s)",
        code: ErrCode.DeleteEntitlementFailed,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
  }

  static async deleteIfNotIn({
    sb,
    internalProductId,
    entitlementIds,
  }: {
    sb: SupabaseClient;
    internalProductId: string;
    entitlementIds: string[];
  }) {
    if (entitlementIds.length === 0) {
      const { error } = await sb
        .from("entitlements")
        .delete()
        .eq("internal_product_id", internalProductId);
      if (error) {
        throw error;
      }
      return;
    }

    const { error } = await sb
      .from("entitlements")
      .delete()
      .not("id", "in", `(${entitlementIds.join(",")})`)
      .eq("internal_product_id", internalProductId);

    if (error) {
      throw error;
    }
  }

  static async getByFeature({
    sb,
    internalFeatureId,
    orgId,
    env,
    withProduct = false,
  }: {
    sb: SupabaseClient;
    internalFeatureId: string;
    orgId: string;
    env: string;
    withProduct?: boolean;
  }) {
    const { data, error } = await sb
      .from("entitlements")
      .select(`*${withProduct ? ", product:products!inner(*)" : ""}` as "*")
      .eq("internal_feature_id", internalFeatureId);

    if (error) {
      throw error;
    }

    return data;
  }

  static async update({
    sb,
    entitlementId,
    updates,
  }: {
    sb: SupabaseClient;
    entitlementId: string;
    updates: Partial<Entitlement>;
  }) {
    const { data, error } = await sb
      .from("entitlements")
      .update(updates)
      .eq("id", entitlementId);

    if (error) {
      throw error;
    }

    return data;
  }
}

// static async getInFeatureIds({
//   sb,

//   internalFeatureIds,
// }: {
//   sb: SupabaseClient;

//   internalFeatureIds: string[];
// }) {
//   const { data, error } = await sb
//     .from("entitlements")
//     .select("*")
//     .in("internal_feature_id", internalFeatureIds);

//   if (error) {
//     throw error;
//   }

//   return data;
// }

// static async getByOrg({
//   sb,
//   orgId,
//   env,
// }: {
//   sb: SupabaseClient;
//   orgId: string;
//   env: string;
// }) {
//   const { data, error } = await sb
//     .from("entitlements")
//     .select("*, feature:features!inner(*)")
//     .eq("feature.org_id", orgId)
//     .eq("feature.env", env);

//   if (error) {
//     throw error;
//   }

//   return data;
// }
