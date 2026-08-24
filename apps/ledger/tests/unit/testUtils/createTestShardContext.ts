import type { AutumnLogger } from "@autumn/logging";
import { createPostgresDb } from "@autumn/postgres";
import { createMemoryJournal } from "../../../src/internal/journal/createMemoryJournal.js";
import type { ShardContext } from "../../../src/internal/shard/types/shardContext.js";
import { createSubjectResidency } from "../../../src/internal/subjects/residency/createSubjectResidency.js";
import { createSqliteDb } from "../../../src/sqlite/common/createSqliteDb.js";

const noop = () => undefined;

const silentLogger: AutumnLogger = {
	debug: noop,
	info: noop,
	warn: noop,
	warning: noop,
	error: noop,
	child: () => silentLogger,
};

// Unit tests seed subjects straight into sqlite, so the pool is never queried.
const unusedPostgres = () =>
	createPostgresDb({ databaseUrl: "postgres://ledger-unit-tests" }).db;

export const createTestShardContext = (): ShardContext => ({
	shardId: 0,
	sqlite: createSqliteDb(),
	postgres: unusedPostgres(),
	journal: createMemoryJournal(),
	subjects: createSubjectResidency(),
	logger: silentLogger,
});
