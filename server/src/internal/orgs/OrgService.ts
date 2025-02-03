import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { initDefaultConfig } from "./orgUtils.js";

export class OrgService {
  static async getOrgs({ sb }: { sb: SupabaseClient }) {
    const { data, error } = await sb.from("organizations").select("*");
    if (error) {
      throw new Error("Error getting orgs from supabase");
    }
    return data;
  }

  static async getFromPkey({
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
      .select("*")
      .eq(fieldName, pkey)
      .select()
      .single();

    if (error) {
      // if (error.code === "PGRST116") {
      //   return null;
      // }

      throw new RecaseError({
        message: "Error getting org from supabase",
        code: ErrCode.OrgNotFound,
        statusCode: 404,
      });
    }

    return data;
  }
  static async getFromReq(req: any) {
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
      throw new RecaseError({
        message: "Failed to get org from supabase",
        code: ErrCode.OrgNotFound,
        statusCode: 404,
      });
    }

    const config = initDefaultConfig();

    return { ...data, config };
  }

  static async getBySlug({ sb, slug }: { sb: SupabaseClient; slug: string }) {
    const { data, error } = await sb
      .from("organizations")
      .select("*")
      .eq("slug", slug)
      .select()
      .single();

    if (error) {
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
      throw new Error("Error inserting org into supabase");
    }

    return data;
  }

  static async delete({ sb, orgId }: { sb: SupabaseClient; orgId: string }) {
    const { error } = await sb.from("organizations").delete().eq("id", orgId);
    if (error) {
      throw new Error("Error deleting org from supabase");
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

    return data;
  }
}
