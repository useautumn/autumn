import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { schema, tableDdl } from "./schema/index.js";

export type SqliteDb = BunSQLiteDatabase<typeof schema>;

export const createSqliteDb = (): SqliteDb => {
	const db = drizzle(new Database(":memory:"), { schema });
	for (const ddl of tableDdl) db.run(sql.raw(ddl));

	return db;
};
