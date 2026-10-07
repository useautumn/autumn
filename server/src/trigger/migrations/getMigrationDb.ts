import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { MIGRATION_DB_POOL_MAX } from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";
import { applyMigrationQueryDeadline } from "./database/applyMigrationQueryDeadline.js";

let migrationDb: DrizzleCli | undefined;

/** Lazily created so only processes that run migration chunks open this pool. */
export const getMigrationDb = (): DrizzleCli => {
	if (migrationDb) return migrationDb;
	const { db, client } = initDrizzle({
		name: "migration",
		maxConnections: MIGRATION_DB_POOL_MAX,
		poolConfig: { statement_timeout: 30_000 },
	});
	applyMigrationQueryDeadline({
		pool: client,
		queryTimeoutMs: 30_000,
		onFailure: (fields) => logger.error("migration_db_failure", fields),
	});
	migrationDb = db;
	return migrationDb;
};
