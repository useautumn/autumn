import { apiKeys } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const deleteApiKey = async ({
	db,
	id,
	orgId,
}: {
	db: DrizzleCli;
	id: string;
	orgId: string;
}) => {
	return await db
		.delete(apiKeys)
		.where(and(eq(apiKeys.id, id), eq(apiKeys.org_id, orgId)))
		.returning();
};
