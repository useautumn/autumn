import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Organization, OrgConfigSchema } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { getApiVersion } from "@/utils/versionUtils.js";
import { clearOrgCache } from "./orgUtils/clearOrgCache.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { eq } from "drizzle-orm";
import { organizations, apiKeys } from "@autumn/shared";

export class OrgService {
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

    return await this.get({ db: req.db, orgId: req.orgId });

    // return await this.getFullOrg({
    //   sb: req.sb,
    //   orgId: req.orgId,
    // });
  }

  // Drizzle get
  static async get({ db, orgId }: { db: DrizzleCli; orgId: string }) {
    const result = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!result) {
      throw new RecaseError({
        message: "Organization not found",
        code: ErrCode.OrgNotFound,
        statusCode: 404,
      });
    }

    return {
      ...result,
      config: OrgConfigSchema.parse(result.config || {}),
      api_version: getApiVersion({
        createdAt: result.created_at!,
      }),
    };
  }

  static async getWithKeys({
    db,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    orgId: string;
    env?: AppEnv;
  }) {
    const result = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      with: {
        api_keys: env ? { where: eq(apiKeys.env, env) } : true,
      },
    });

    if (!result) {
      return null;
    }

    return result;
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
  static async insert({ db, org }: { db: DrizzleCli; org: any }) {
    await db.insert(organizations).values(org);
  }

  static async delete({ db, orgId }: { db: DrizzleCli; orgId: string }) {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }

  static async update({
    db,
    orgId,
    updates,
  }: {
    db: DrizzleCli;
    orgId: string;
    updates: any;
  }) {
    try {
      let result = await db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, orgId))
        .returning();

      await clearOrgCache({
        db,
        orgId,
      });

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
