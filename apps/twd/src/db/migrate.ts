import { existsSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "../lib/getDb.ts";
import { getLogger } from "../lib/logger.ts";

const MIGRATIONS_FOLDER = join(import.meta.dir, "migrations");

/** Applies drizzle migrations from src/db/migrations; a no-op until they are generated. */
export const runMigrations = async () => {
	const logger = getLogger();
	if (!existsSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) {
		logger.warn("no drizzle migrations found; skipping", {
			folder: MIGRATIONS_FOLDER,
		});
		return;
	}
	await migrate(getDb(), { migrationsFolder: MIGRATIONS_FOLDER });
	logger.info("migrations applied", { folder: MIGRATIONS_FOLDER });
};

if (import.meta.main) {
	await runMigrations();
	process.exit(0);
}
