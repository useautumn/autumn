import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { createSupabaseClient } from "../supabaseUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { safeSb } from "./safeSb.js";

export const subscribeToOrgUpdates = safeSb({
  fn: ({ db }: { db: DrizzleCli }) => {
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
  },
  action: "subscribe to org updates",
});
