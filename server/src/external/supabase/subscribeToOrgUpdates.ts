import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { createSupabaseClient } from "../supabaseUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const subscribeToOrgUpdates = ({ db }: { db: DrizzleCli }) => {
  try {
    const sb = createSupabaseClient();
    sb.channel("table-db-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "organizations",
        },
        async (payload) => {
          // await clearOrgCache(payload.new.id);
          try {
            await clearOrgCache({ db, orgId: payload.new.id });
          } catch (error) {
            console.warn("Error clearing org cache:", error);
          }
        },
      )
      .subscribe();
  } catch (error) {
    console.warn("Error subscribing to org updates:", error);
  }
};
