import { schemas } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { PostgresDb } from "../../createPostgresDb.js";

export const listByInternalIds = ({
	db,
	internalIds,
}: {
	db: PostgresDb;
	internalIds: string[];
}) => {
	if (internalIds.length === 0) return Promise.resolve([]);

	return db.query.products.findMany({
		where: inArray(schemas.products.internal_id, internalIds),
	});
};
