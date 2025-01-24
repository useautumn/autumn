import { getOrgById } from "@/external/clerkUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class OrgService {
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

    return data;

    // const clerkOrg = await getOrgById(orgId);
    // let privateMeta: any = clerkOrg.privateMetadata;
    // let publicMeta: any = clerkOrg.publicMetadata;

    // let org: Organization = {
    //   id: clerkOrg.id,
    //   slug: clerkOrg.slug || "",
    //   default_currency: publicMeta.default_currency || "usd",
    //   stripe_connected: publicMeta.stripe_connected,
    //   stripe_config: {
    //     test_api_key: privateMeta.stripe?.test_api_key,
    //     live_api_key: privateMeta.stripe?.live_api_key,
    //     test_webhook_secret: privateMeta.stripe?.test_webhook_secret,
    //     live_webhook_secret: privateMeta.stripe?.live_webhook_secret,
    //     success_url: privateMeta.stripe?.success_url,
    //   },
    // };

    // return org;
  }
}
