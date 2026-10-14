import { apiKeys } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const deleteApiKeysByOrg = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) => {
	return await db.delete(apiKeys).where(eq(apiKeys.org_id, orgId)).returning();
};
