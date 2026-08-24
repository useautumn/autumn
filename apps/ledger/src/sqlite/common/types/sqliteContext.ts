import type { SqliteDb } from "../createSqliteDb.js";

// The slice of a caller's ctx that the sqlite repos read.
export type SqliteContext = { sqlite: SqliteDb };
