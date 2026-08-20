import { apiKeys } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/**
 * Deletes every API key belonging to an org, across environments.
 * Used to revoke keys for machine-managed orgs (e.g. pricing agent preview
 * sandboxes) that no human is able to manage from the dashboard.
 */
export const deleteApiKeysByOrg = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) => {
	return await db.delete(apiKeys).where(eq(apiKeys.org_id, orgId)).returning();
};
