import { CacheType } from "@/external/caching/cacheActions.js";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { getAPIKeyCache } from "@/external/caching/cacheUtils.js";
import { sbWithRetry } from "@/external/supabaseUtils.js";
import { getApiVersion } from "@/utils/versionUtils.js";

import { ApiKey, AppEnv, ErrCode, OrgConfigSchema } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class ApiKeyService {
  static async verifyAndFetch({
    sb,
    hashedKey,
    env,
  }: {
    sb: SupabaseClient;
    hashedKey: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb.rpc("verify_api_key", {
      p_hashed_key: hashedKey,
      p_env: env,
    });

    if (error) {
      throw error;
    }

    if (!data.success || !data.organization) {
      console.warn(`(warning) failed to verify secret key: ${data.error}`);
      return null;
    }

    let org = structuredClone(data.organization);
    delete org.features;

    // Add org config and api version
    org.config = OrgConfigSchema.parse(org.config || {});
    org.api_version = getApiVersion({
      createdAt: org.created_at,
    });

    return {
      org,
      features: data.organization?.features || [],
      env,
    };
  }

  static async getByOrg(sb: SupabaseClient, orgId: string, env: AppEnv) {
    const { data, error } = await sb
      .from("api_keys")
      .select("*")
      .eq("org_id", orgId)
      .eq("env", env)
      .order("created_at", {
        ascending: false,
      })
      .order("id");

    if (error) {
      throw error;
    }

    return data;
  }
  static async insert(sb: SupabaseClient, apiKey: ApiKey) {
    await sb.from("api_keys").insert(apiKey);
  }

  static async deleteStrict(sb: SupabaseClient, id: string, orgId: string) {
    const { data, error } = await sb
      .from("api_keys")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
      .select();

    if (error) {
      throw new Error("Failed to delete API key");
    }

    return data;
  }

  static async getByHashedKey({
    sb,
    hashedKey,
    logger,
  }: {
    sb: SupabaseClient;
    hashedKey: string;
    logger: any;
  }) {
    const { data, error } = await sbWithRetry({
      query: async () => {
        return await sb
          .from("api_keys")
          .select("*")
          .eq("hashed_key", hashedKey)
          .single();
      },
      logger: logger,
    });

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }

      throw error;
    }

    return data;
  }

  static async update({
    sb,
    update,
    keyId,
  }: {
    sb: SupabaseClient;
    update: any;
    keyId: string;
  }) {
    const { error } = await sb.from("api_keys").update(update).eq("id", keyId);

    if (error) {
      throw error;
    }
  }
}

export class CachedKeyService {
  static async clearCache({ hashedKey }: { hashedKey: string }) {
    try {
      await CacheManager.invalidate({
        action: CacheType.SecretKey,
        value: hashedKey,
      });
    } catch (error) {
      console.error(
        `(warning) failed to clear cache for verify action: ${error}`,
      );
    }
  }
}
