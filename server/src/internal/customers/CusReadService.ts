import { SupabaseClient } from "@supabase/supabase-js";

export class CusReadService {
  static async getInInternalIds({
    sb,
    internalIds,
  }: {
    sb: SupabaseClient;
    internalIds: string[];
  }) {
    const { data, error } = await sb
      .from("customers")
      .select("*")
      .in("internal_id", internalIds);

    if (error) {
      throw error;
    }

    return data;
  }
}
