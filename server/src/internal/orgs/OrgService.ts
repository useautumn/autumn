import { getOrgById } from "@/external/clerkUtils.js";
import { Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class OrgService {
  static async getFullOrg({
    sb,
    orgId,
  }: {
    sb: SupabaseClient;
    orgId: string;
  }) {
    const clerkOrg = await getOrgById(orgId);
    let privateMeta: any = clerkOrg.privateMetadata;
    let publicMeta: any = clerkOrg.publicMetadata;

    let org: Organization = {
      id: clerkOrg.id,
      default_currency: publicMeta.default_currency || "usd",
      stripe_connected: publicMeta.stripe_connected,
      stripe_config: {
        test_api_key: privateMeta.stripe?.test_api_key,
        live_api_key: privateMeta.stripe?.live_api_key,
        test_webhook_secret: privateMeta.stripe?.test_webhook_secret,
        live_webhook_secret: privateMeta.stripe?.live_webhook_secret,
        success_url: privateMeta.stripe?.success_url,
      },
    };

    return org;
  }
}
