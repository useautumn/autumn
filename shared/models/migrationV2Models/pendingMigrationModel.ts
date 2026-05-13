import type { MigrationRun } from "./migrationRunTable.js";
import type { Migration } from "./migrationTable.js";

export type PendingMigration = MigrationRun & { migration: Migration };
