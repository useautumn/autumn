import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Organization, OrgConfigSchema } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { initDefaultConfig } from "./orgUtils.js";
import { getApiVersion } from "@/utils/versionUtils.js";
import { clearOrgCache } from "./orgUtils/clearOrgCache.js";

export class OrgService {
  static async getWithKeys({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env?: AppEnv;
  }) {
    const query = sb
      .from("organizations")
      .select("*, api_keys(*)")
      .eq("id", orgId);

    if (env) {
      query.eq("api_keys.env", env);
    }

    const { data, error } = await query.single();

    if (error) {
      throw error;
    }

    return data;
  }
  static async getWithFeatures({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("organizations")
      .select("*, features(*)")
      .eq("id", orgId)
      .eq("features.env", env)
      .single();

    if (error) {
      throw new Error("Error getting orgs from supabase");
    }

    let org = structuredClone(data);
    delete org.features;
    return { org, features: data.features || [] };
  }

  static async getOrgs({ sb }: { sb: SupabaseClient }) {
    const { data, error } = await sb.from("organizations").select("*");
    if (error) {
      throw new Error("Error getting orgs from supabase");
    }
    return data;
  }

  static async getFromPkeyWithFeatures({
    sb,
    pkey,
    env,
  }: {
    sb: SupabaseClient;
    pkey: string;
    env: AppEnv;
  }) {
    let fieldName = env === AppEnv.Sandbox ? "test_pkey" : "live_pkey";
    const { data, error } = await sb
      .from("organizations")
      .select("*, features(*)")
      .eq(fieldName, pkey)
      .eq("features.env", env)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }

      throw new RecaseError({
        message: "Error getting org from supabase",
        code: ErrCode.OrgNotFound,
        statusCode: 404,
        data: error,
      });
    }

    return data;
  }
  static async getFromReq(req: any) {
    if (req.org) {
      let org = structuredClone(req.org);
      let config = org.config || {};
      let apiVersion = getApiVersion({
        createdAt: org.created_at,
      });
      return {
        ...org,
        config: OrgConfigSchema.parse(config),
        api_version: apiVersion,
      };
    }

    return await this.getFullOrg({
      sb: req.sb,
      orgId: req.orgId,
    });
  }

  static async getFullOrg({
    sb,
    orgId,
  }: {
    sb: SupabaseClient;
    orgId: string;
  }) {
    const { data, error } = await sb
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new RecaseError({
          message: "Failed to get org from supabase",
          code: ErrCode.OrgNotFound,
          statusCode: 404,
          data: error,
        });
      } else {
        throw error;
      }
    }

    let config = data.config || {};
    let apiVersion = getApiVersion({
      createdAt: data.created_at,
    });

    return {
      ...data,
      config: OrgConfigSchema.parse(config),
      api_version: apiVersion,
    };
  }

  static async getBySlug({ sb, slug }: { sb: SupabaseClient; slug: string }) {
    const { data, error } = await sb
      .from("organizations")
      .select("*")
      .eq("slug", slug)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }

      throw new RecaseError({
        message: "Failed to get org from supabase",
        code: ErrCode.OrgNotFound,
        statusCode: 404,
      });
    }

    return data;
  }
  static async insert({ sb, org }: { sb: SupabaseClient; org: Organization }) {
    // Insert org into supabase
    const { data, error } = await sb.from("organizations").insert(org);
    if (error) {
      throw new RecaseError({
        message: "Error inserting org into supabase",
        code: ErrCode.InternalError,
        statusCode: 400,
        data: error,
      });
    }

    return data;
  }

  static async delete({ sb, orgId }: { sb: SupabaseClient; orgId: string }) {
    const { error } = await sb.from("organizations").delete().eq("id", orgId);
    if (error) {
      throw new RecaseError({
        message: "Error deleting org from supabase",
        code: ErrCode.InternalError,
        statusCode: 400,
        data: error,
      });
    }
  }

  static async update({
    sb,
    orgId,
    updates,
  }: {
    sb: SupabaseClient;
    orgId: string;
    updates: Partial<Organization>;
  }) {
    const { data, error } = await sb
      .from("organizations")
      .update(updates)
      .eq("id", orgId);

    if (error) {
      throw new Error("Error updating org in supabase");
    }

    await clearOrgCache({
      sb,
      orgId,
    });

    return data;
  }
}
