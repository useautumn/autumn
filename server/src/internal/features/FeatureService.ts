import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, CreditSchemaItem, Feature, FeatureType } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { creditSystemContainsFeature } from "./creditSystemUtils.js";

export class FeatureService {
  static async getFromReq(req: any) {
    const features = await FeatureService.getFeatures({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
    });
    return features;
  }

  static async getFeatures({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("features")
      .select("*")
      .eq("org_id", orgId)
      .eq("env", env)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }
    return data;
  }

  static async getById({
    sb,
    featureId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    featureId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("features")
      .select("*")
      .eq("id", featureId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }
    return data;
  }

  static async getCreditSystemsUsingFeature({
    pg,
    featureId,
    orgId,
    env,
  }: {
    pg: Client;
    featureId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const query = `select * from features WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
      schema_element->>'metered_feature_id' = '${featureId}'
      AND org_id = '${orgId}' AND env = '${env}'
    )`;

    const { rows } = await pg.query(query);

    return rows;
  }

  static async updateStrict({
    sb,
    featureId,
    orgId,
    env,
    updates,
  }: {
    sb: SupabaseClient;
    featureId: string;
    orgId: string;
    env: AppEnv;
    updates: any;
  }) {
    let { error } = await sb
      .from("features")
      .update(updates)
      .eq("id", featureId)
      .eq("org_id", orgId)
      .eq("env", env)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new RecaseError({
          message: "Feature not found",
          code: ErrCode.FeatureNotFound,
          statusCode: 404,
        });
      }

      throw new RecaseError({
        message: "Failed to update feature",
        code: ErrCode.UpdateFeatureFailed,
        statusCode: 500,
        data: error,
      });
    }
  }

  static async insert({
    sb,
    data,
  }: {
    sb: SupabaseClient;
    data: Feature[] | Feature;
  }) {
    // Insert feature into DB
    let { data: insertedData, error } = await sb
      .from("features")
      .insert(data)
      .select();

    if (error) {
      if (error.code === "23505") {
        let id = Array.isArray(data) ? data.map((f) => f.id) : data.id;
        throw new RecaseError({
          message: `Feature ${id} already exists`,
          code: ErrCode.DuplicateFeatureId,
          statusCode: 400,
        });
      }
      throw error;
    }

    return insertedData;
  }

  static async deleteStrict({
    sb,
    featureId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    featureId: string;
    orgId: string;
    env: AppEnv;
  }) {
    let { error } = await sb
      .from("features")
      .delete()
      .eq("id", featureId)
      .eq("org_id", orgId)
      .eq("env", env)
      .select();

    if (error) {
      if (error.code === "PGRST106") {
        throw new RecaseError({
          message: "Feature not found",
          code: ErrCode.FeatureNotFound,
          statusCode: 404,
        });
      }

      throw error;
    }
  }

  static async getWithCreditSystems({
    sb,
    featureId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    featureId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("features")
      .select("*")
      .eq("org_id", orgId)
      .eq("env", env)
      .or(`id.eq.${featureId},type.eq.${FeatureType.CreditSystem}`);

    if (error) {
      throw error;
    }

    let feature = data.find((f) => f.id === featureId);

    let creditSystems = data.filter(
      (f) =>
        f.type === FeatureType.CreditSystem &&
        f.id !== featureId &&
        creditSystemContainsFeature({
          creditSystem: f,
          meteredFeatureId: featureId,
        })
    );

    return {
      feature,
      creditSystems,
    };
  }
}
