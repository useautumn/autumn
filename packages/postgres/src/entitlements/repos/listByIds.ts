import { schemas } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { PostgresDb } from "../../createPostgresDb.js";

export const listByIds = ({ db, ids }: { db: PostgresDb; ids: string[] }) => {
	if (ids.length === 0) return Promise.resolve([]);

	return db.query.entitlements.findMany({
		where: inArray(schemas.entitlements.id, ids),
	});
};
