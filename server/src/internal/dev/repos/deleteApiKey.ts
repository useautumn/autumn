import { apiKeys } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const deleteApiKey = async ({
	db,
	id,
	orgId,
	allowHidden,
}: {
	db: DrizzleCli;
	id: string;
	orgId: string;
	allowHidden: boolean;
}) => {
	const visibilityCondition = allowHidden
		? undefined
		: sql`COALESCE(${apiKeys.meta}->>'visibility', '') != ${"superuser"}`;

	return await db
		.delete(apiKeys)
		.where(
			and(eq(apiKeys.id, id), eq(apiKeys.org_id, orgId), visibilityCondition),
		)
		.returning();
};
