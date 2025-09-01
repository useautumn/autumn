import { PgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
function collatePgColumn<C extends PgColumn<any>>(col: C, collation: string) {
	const originalGetSQLType = col.getSQLType;
	col.getSQLType = function (this: C) {
		return originalGetSQLType.call(this) + ` COLLATE "${collation}"`;
	};
	return col;
}

export const sqlNow = sql`ROUND(date_part('epoch', NOW()) * 1000)::BIGINT`;

export { collatePgColumn };
