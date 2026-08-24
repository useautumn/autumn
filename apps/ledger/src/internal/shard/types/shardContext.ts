import type { AutumnLogger } from "@autumn/logging";
import type { PostgresDb } from "@autumn/postgres";
import type { SqliteDb } from "../../../sqlite/common/createSqliteDb.js";
import type { Journal } from "../../journal/types/journal.js";
import type { SubjectResidency } from "../../subjects/residency/types/subjectResidency.js";

export type ShardContext = {
	shardId: number;
	sqlite: SqliteDb;
	postgres: PostgresDb;
	journal: Journal;
	subjects: SubjectResidency;
	logger: AutumnLogger;
};
