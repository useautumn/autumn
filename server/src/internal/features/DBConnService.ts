import { createSupabaseClient } from "@/external/supabaseUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { DBConnection } from "@autumn/shared";

export class DBConnService {
  static async getByOrg(orgId: string) {
    let supabaseCli = createSupabaseClient();

    let { data, error } = await supabaseCli
      .from("db_connections")
      .select("*")
      .eq("org_id", orgId);

    if (error) {
      throw new RecaseError({
        message: "Failed to get db_connections from Supabase",
        code: "get_db_conns_failed",
      });
    }

    return data;
  }

  static async insert(dbConn: DBConnection) {
    let supabaseCli = createSupabaseClient();

    let { data, error } = await supabaseCli
      .from("db_connections")
      .insert(dbConn);

    if (error) {
      console.error("Failed to create db_connection in Supabase:", error);

      throw new RecaseError({
        message: "Failed to create db_connection in Supabase",
        code: "create_db_conn_failed",
      });
    }

    // return data;
  }
}
