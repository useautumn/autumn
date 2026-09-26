import { type EntityDisplayInfo, entities } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/** Looks up entity display fields by public id. Entity ids with no row are omitted. */
export const getEntityNames = async ({
	db,
	entityIds,
	orgId,
	env,
}: {
	db: DrizzleCli;
	entityIds: string[];
	orgId: string;
	env: string;
}): Promise<Record<string, EntityDisplayInfo>> => {
	if (entityIds.length === 0) return {};

	const rows = await db
		.select({
			id: entities.id,
			name: entities.name,
			internal_customer_id: entities.internal_customer_id,
		})
		.from(entities)
		.where(
			and(
				eq(entities.org_id, orgId),
				eq(entities.env, env),
				inArray(entities.id, entityIds),
				eq(entities.deleted, false),
			),
		);

	const displayMap: Record<string, EntityDisplayInfo> = {};
	for (const row of rows) {
		if (!row.id) continue;
		displayMap[row.id] = {
			name: row.name || null,
			internal_customer_id: row.internal_customer_id,
		};
	}

	return displayMap;
};
