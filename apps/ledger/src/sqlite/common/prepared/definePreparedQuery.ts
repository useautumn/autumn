import type { SqliteDb } from "../createSqliteDb.js";
import type { SqliteContext } from "../types/sqliteContext.js";

// Drizzle compiles the statement once per shard database; every later call only
// binds placeholders, so a repo costs no query building.
export const definePreparedQuery = <TStatement>({
	build,
}: {
	build: (db: SqliteDb) => TStatement;
}): ((params: { ctx: SqliteContext }) => TStatement) => {
	const statements = new WeakMap<SqliteDb, TStatement>();

	return ({ ctx }) => {
		const prepared = statements.get(ctx.sqlite);
		if (prepared) return prepared;

		const statement = build(ctx.sqlite);
		statements.set(ctx.sqlite, statement);
		return statement;
	};
};
