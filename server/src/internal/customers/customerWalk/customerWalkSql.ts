import type { CustomerWalkCursorFields } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

/** Customers at or after the cursor's customer, in walk order (internal_id DESC). */
export const customerWalkStartSql = ({
	column,
	cursor,
}: {
	column: SQL;
	cursor: CustomerWalkCursorFields | null;
}) => {
	if (!cursor) return sql``;
	return cursor.t === null
		? sql`AND ${column} < ${cursor.c}`
		: sql`AND ${column} <= ${cursor.c}`;
};

/** Rows strictly after the cursor in (customer DESC, created_at DESC, id DESC) order. */
export const customerWalkRowAfterSql = ({
	customerColumn,
	createdAtColumn,
	idColumn,
	cursor,
}: {
	customerColumn: SQL;
	createdAtColumn: SQL;
	idColumn: SQL;
	cursor: CustomerWalkCursorFields | null;
}) => {
	if (!cursor) return sql``;
	if (cursor.t === null || cursor.id === null) {
		return sql`AND ${customerColumn} < ${cursor.c}`;
	}
	return sql`AND (
		${customerColumn} < ${cursor.c}
		OR (${customerColumn} = ${cursor.c} AND (${createdAtColumn}, ${idColumn}) < (${cursor.t}, ${cursor.id}))
	)`;
};

export const customerWalkOrderSql = ({
	customerColumn,
	createdAtColumn,
	idColumn,
}: {
	customerColumn: SQL;
	createdAtColumn: SQL;
	idColumn: SQL;
}) =>
	sql`ORDER BY ${customerColumn} DESC, ${createdAtColumn} DESC, ${idColumn} DESC`;
