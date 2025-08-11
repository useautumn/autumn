import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { DrizzleCli, client } from "@/db/initDrizzle.js";

export const subscribeToOrgUpdates = async ({ db }: { db: DrizzleCli }) => {
  try {
    await client.listen("org_updates", async (payload) => {
      try {
        const data = JSON.parse(payload);
        if (data.table === "organizations" && data.operation === "UPDATE") {
          await clearOrgCache({ db, orgId: data.new.id });
        }
      } catch (error) {
        console.warn("Error processing org update notification:", error);
      }
    });
    
    console.log("Successfully subscribed to organization updates via PostgreSQL LISTEN/NOTIFY");
  } catch (error) {
    console.warn("Error subscribing to org updates:", error);
  }
};
