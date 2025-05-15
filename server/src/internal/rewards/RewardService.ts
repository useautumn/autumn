import { generateId } from "@/utils/genUtils.js";
import { AppEnv, Reward } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class RewardService {
  static async insert({
    sb,
    data,
  }: {
    sb: SupabaseClient;
    data: Reward | Reward[];
  }) {
    const { data: insertedData, error } = await sb
      .from("rewards")
      .insert(data)
      .select();

    if (error) {
      throw error;
    }
    return insertedData;
  }

  static async getAll({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("rewards")
      .select()
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }
    return data;
  }

  static async deleteStrict({
    sb,
    internalId,
    env,
    orgId,
  }: {
    sb: SupabaseClient;
    internalId: string;
    env: AppEnv;
    orgId: string;
  }) {
    const { error } = await sb
      .from("rewards")
      .delete()
      .eq("internal_id", internalId)
      .eq("env", env)
      .eq("org_id", orgId);
    if (error) {
      throw error;
    }
  }

  static async getById({
    sb,
    id,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    id: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("rewards")
      .select()
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  static async getByInternalId({
    sb,
    internalId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("rewards")
      .select()
      .eq("internal_id", internalId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      if (error.code == "PGRST116") {
        return null;
      }
      throw error;
    }
    return data;
  }

  static async update({
    sb,
    internalId,
    env,
    orgId,
    update,
  }: {
    sb: SupabaseClient;
    internalId: string;
    env: AppEnv;
    orgId: string;
    update: Partial<Reward>;
  }) {
    const { data, error } = await sb
      .from("rewards")
      .update(update)
      .eq("internal_id", internalId)
      .eq("env", env)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }
}
