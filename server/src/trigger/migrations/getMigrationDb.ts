import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { MIGRATION_DB_POOL_MAX } from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";

let migrationDb: DrizzleCli | undefined;

/** Lazily created so only processes that run migration chunks open this pool. */
export const getMigrationDb = (): DrizzleCli => {
	migrationDb ??= initDrizzle({
		name: "migration",
		maxConnections: MIGRATION_DB_POOL_MAX,
	}).db;
	return migrationDb;
};
