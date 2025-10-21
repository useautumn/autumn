import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export interface ArrayAggregationConfig {
	table: PgTable;
	alias?: string;
	filter?: SQL;
	orderBy?: SQL[];
	limit?: number;
	distinct?: boolean;
}

export interface RowSubqueryConfig {
	table: PgTable;
	alias?: string;
	where?: SQL;
}

export interface JunctionJoinConfig {
	junctionTable: PgTable;
	fromField: string;
	toField: string;
	fromTable: PgTable;
	toTable: PgTable;
	fromId: SQL;
}

/**
 * Generate json_agg SQL for array aggregation with COALESCE to empty array
 * Example: COALESCE(json_agg(row_to_json(e) ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL), '[]'::json)
 */
export function generateArrayAggSQL({
	table,
	alias,
	filter,
	orderBy,
	limit,
	distinct = false,
}: ArrayAggregationConfig): SQL {
	const tableAlias = alias || getTableAlias(table);
	const distinctKeyword = distinct ? sql`DISTINCT ` : sql``;

	let aggExpression = sql`json_agg(${distinctKeyword}row_to_json(${sql.identifier(tableAlias)})`;

	// Add ORDER BY if provided
	if (orderBy && orderBy.length > 0) {
		aggExpression = sql`${aggExpression} ORDER BY ${sql.join(orderBy, sql`, `)}`;
	}

	aggExpression = sql`${aggExpression})`;

	// Add FILTER clause if provided
	if (filter) {
		aggExpression = sql`${aggExpression} FILTER (WHERE ${filter})`;
	}

	// Wrap with COALESCE to handle NULL → empty array
	return sql`COALESCE(${aggExpression}, '[]'::json)`;
}

/**
 * Generate row_to_json SQL for single row subquery
 * Example: (SELECT row_to_json(p) FROM products p WHERE p.id = ${parentId})
 */
export function generateRowSubquerySQL({
	table,
	alias,
	where,
}: RowSubqueryConfig): SQL {
	const tableAlias = alias || getTableAlias(table);
	const tableName = getTableName(table);

	let query = sql`(SELECT row_to_json(${sql.identifier(tableAlias)}) FROM ${sql.identifier(tableName)} ${sql.identifier(tableAlias)}`;

	if (where) {
		query = sql`${query} WHERE ${where}`;
	}

	query = sql`${query})`;

	return query;
}

/**
 * Generate SQL for many-to-many join through junction table
 * Example:
 * SELECT json_agg(o)
 * FROM member m
 * INNER JOIN organizations o ON o.id = m.organization_id
 * WHERE m.user_id = ${userId}
 */
export function generateJunctionJoinSQL({
	junctionTable,
	fromField,
	toField,
	fromTable,
	toTable,
	fromId,
}: JunctionJoinConfig): SQL {
	const junctionAlias = getTableAlias(junctionTable);
	const toAlias = getTableAlias(toTable);
	const junctionTableName = getTableName(junctionTable);
	const toTableName = getTableName(toTable);

	return sql`
		FROM ${sql.identifier(junctionTableName)} ${sql.identifier(junctionAlias)}
		INNER JOIN ${sql.identifier(toTableName)} ${sql.identifier(toAlias)}
			ON ${sql.identifier(toAlias)}.${sql.identifier("id")} = ${sql.identifier(junctionAlias)}.${sql.identifier(toField)}
		WHERE ${sql.identifier(junctionAlias)}.${sql.identifier(fromField)} = ${fromId}
	`;
}

/**
 * Generate SQL for limiting results per parent using window functions
 * Example: row_number() OVER (PARTITION BY user_id ORDER BY created_at)
 */
export function generateRowNumberSQL({
	partitionBy,
	orderBy,
}: {
	partitionBy: SQL;
	orderBy?: SQL[];
}): SQL {
	let windowSQL = sql`row_number() OVER (PARTITION BY ${partitionBy}`;

	if (orderBy && orderBy.length > 0) {
		windowSQL = sql`${windowSQL} ORDER BY ${sql.join(orderBy, sql`, `)}`;
	}

	windowSQL = sql`${windowSQL})`;

	return windowSQL;
}

/**
 * Extract table name from Drizzle table object
 */
function getTableName(table: PgTable): string {
	return (table as any)[Symbol.for("drizzle:Name")] || String(table);
}

/**
 * Generate a short alias for a table (first letter of table name)
 */
function getTableAlias(table: PgTable): string {
	const tableName = getTableName(table);
	return tableName.charAt(0);
}
