import { ApiKey, AppEnv } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class ApiKeyService {
  static async getByOrg(sb: SupabaseClient, orgId: string, env: AppEnv) {
    const { data, error } = await sb
      .from("api_keys")
      .select("*")
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw new Error("Failed to get API key");
    }

    return data;
  }
  static async insert(sb: SupabaseClient, apiKey: ApiKey) {
    await sb.from("api_keys").insert(apiKey);
  }

  static async deleteStrict(sb: SupabaseClient, id: string, orgId: string) {
    const { error, count } = await sb
      .from("api_keys")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      throw new Error("Failed to delete API key");
    }

    return count;
  }

  static async getByHashedKey(sb: SupabaseClient, hashedKey: string) {
    const { data, error } = await sb
      .from("api_keys")
      .select("*")
      .eq("hashed_key", hashedKey)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error("Failed to get API key");
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
      throw new Error("Failed to update API key");
    }
  }
}
