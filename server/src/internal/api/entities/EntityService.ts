import { SupabaseClient } from "@supabase/supabase-js";
import { env } from "process";

export class EntityService {
  static async getById({
    sb,
    entityId,
    internalCustomerId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    entityId: string;
    internalCustomerId?: string;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("entities")
      .select("*")
      .eq("id", entityId)
      .eq("internal_customer_id", internalCustomerId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async insert({ sb, data }: { sb: SupabaseClient; data: any }) {
    const { error } = await sb.from("entities").insert(data);

    if (error) {
      throw error;
    }

    return data;
  }

  static async get({
    sb,
    orgId,
    internalFeatureId,
    internalCustomerId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: string;
    internalFeatureId?: string;
    internalCustomerId?: string;
  }) {
    let query = sb
      .from("entities")
      .select("*")
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("internal_customer_id", internalCustomerId);

    if (internalFeatureId) {
      query = query.eq("internal_feature_id", internalFeatureId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  static async update({
    sb,
    internalId,
    update,
  }: {
    sb: SupabaseClient;
    internalId: string;
    update: any;
  }) {
    const { error } = await sb
      .from("entities")
      .update(update)
      .eq("internal_id", internalId);

    if (error) {
      throw error;
    }
  }

  static async getByInternalCustomerId({
    sb,
    internalCustomerId,
    logger,
    inFeatureIds,
    isDeleted,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    logger: any;
    inFeatureIds?: string[];
    isDeleted?: boolean;
  }) {
    let query = sb
      .from("entities")
      .select("*")
      .eq("internal_customer_id", internalCustomerId);

    if (inFeatureIds) {
      query = query.in("internal_feature_id", inFeatureIds);
    }

    if (isDeleted) {
      query = query.eq("deleted", true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  static async getByCustomerId({
    sb,
    customerId,
    logger,
    inFeatureIds,
    isDeleted,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    customerId: string;
    logger: any;
    inFeatureIds?: string[];
    isDeleted?: boolean;
    orgId: string;
    env: string;
  }) {
    let query = sb
      .from("entities")
      .select("*")
      .eq("customer_id", customerId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (inFeatureIds) {
      query = query.in("internal_feature_id", inFeatureIds);
    }

    if (isDeleted) {
      query = query.eq("deleted", true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  static async deleteInInternalIds({
    sb,
    internalIds,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalIds: string[];
    orgId: string;
    env: string;
  }) {
    const { error } = await sb
      .from("entities")
      .delete()
      .in("internal_id", internalIds)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }
  }

  static async deleteByInternalFeatureId({
    sb,
    internalFeatureIds,
    internalCustomerId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalFeatureIds: string[];
    internalCustomerId: string;
    orgId: string;
    env: string;
  }) {
    const { error } = await sb
      .from("entities")
      .delete()
      .in("internal_feature_id", internalFeatureIds)
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("internal_customer_id", internalCustomerId);

    if (error) {
      throw error;
    }
  }
}
