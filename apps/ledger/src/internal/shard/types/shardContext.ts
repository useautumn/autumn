import type { AutumnLogger } from "@autumn/logging";
import type { SqliteDb } from "../../../sqlite/createSqliteDb.js";
import type { Journal } from "../../journal/types/journal.js";

export type ShardContext = {
	shardId: number;
	sqlite: SqliteDb;
	journal: Journal;
	logger: AutumnLogger;
};
