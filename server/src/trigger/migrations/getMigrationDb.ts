import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	MIGRATION_DB_POOL_MAX,
	MIGRATION_DB_QUERY_DEADLINE_MS,
} from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";
import { applyMigrationQueryDeadline } from "./database/applyMigrationQueryDeadline.js";

let migrationDb: DrizzleCli | undefined;

/** Lazily created so only processes that run migration chunks open this pool. */
export const getMigrationDb = (): DrizzleCli => {
	if (migrationDb) return migrationDb;
	const { db, client } = initDrizzle({
		name: "migration",
		maxConnections: MIGRATION_DB_POOL_MAX,
	});
	applyMigrationQueryDeadline({
		pool: client,
		queryTimeoutMs: MIGRATION_DB_QUERY_DEADLINE_MS,
		onFailure: (fields) => logger.error("migration_db_failure", fields),
	});
	migrationDb = db;
	return migrationDb;
};
