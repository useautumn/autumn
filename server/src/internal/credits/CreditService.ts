import { CreditSystem } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class CreditService {
  static async getByOrg(sb: SupabaseClient, orgId: string) {
    let { data, error } = await sb
      .from("credit_systems")
      .select("*")
      .eq("org_id", orgId);

    if (error) throw error;

    return data;
  }

  static async insert(sb: SupabaseClient, creditSystem: CreditSystem) {
    let { data, error } = await sb.from("credit_systems").insert(creditSystem);

    if (error) throw error;

    return data;
  }
}
