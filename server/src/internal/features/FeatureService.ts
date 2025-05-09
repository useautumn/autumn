import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, CreditSchemaItem, Feature, FeatureType } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { creditSystemContainsFeature } from "./creditSystemUtils.js";
import { clearOrgCache } from "../orgs/orgUtils/clearOrgCache.js";

export class FeatureService {
  static async getFromReq(req: any) {
    if (req.features) return req.features as Feature[];
    const features = await FeatureService.getFeatures({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
    });
    return features as Feature[];
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
      .order("created_at", { ascending: false })
      .order("id");

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

  static async update({
    sb,
    internalFeatureId,
    updates,
  }: {
    sb: SupabaseClient;
    internalFeatureId: string;
    updates: any;
  }) {
    let { data, error } = await sb
      .from("features")
      .update(updates)
      .eq("internal_id", internalFeatureId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (data) {
      await clearOrgCache({
        sb,
        orgId: data.org_id,
        env: data.env,
      });
    }

    return data;
  }
  static async updateStrict({
    sb,
    featureId,
    orgId,
    env,
    updates,
    logger,
  }: {
    sb: SupabaseClient;
    featureId: string;
    orgId: string;
    env: AppEnv;
    updates: any;
    logger: any;
  }) {
    let { data, error } = await sb
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

    await clearOrgCache({
      sb,
      orgId,
      env,
      logger,
    });

    return data;
  }

  static async insert({
    sb,
    data,
    logger,
  }: {
    sb: SupabaseClient;
    data: Feature[] | Feature;
    logger: any;
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

    if (insertedData && insertedData.length > 0) {
      let orgId = insertedData[0].org_id;
      await clearOrgCache({
        sb,
        orgId,
        logger,
      });
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

    await clearOrgCache({
      sb,
      orgId,
      env,
    });
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
