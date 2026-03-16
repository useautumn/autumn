import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * Check if an error is a Postgres unique constraint violation (error code 23505).
 */
export const isUniqueConstraintError = (error: unknown): boolean => {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
};

/** Extract the `code` property from a postgres.js error (SQLSTATE or driver-level). */
const getErrorCode = ({ error }: { error: unknown }): string | null => {
	if (typeof error !== "object" || error === null) return null;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
};

/**
 * PostgreSQL SQLSTATE code prefixes that indicate infrastructure issues.
 * - Class 08: Connection Exception (connection lost, refused, broken pipe)
 * - Class 53: Insufficient Resources (out of memory, disk full, too many connections)
 */
const RETRYABLE_PG_CODE_PREFIXES = ["08", "53"];

/**
 * Specific SQLSTATE and postgres.js driver codes that indicate infrastructure issues.
 * - 57014: query_canceled (statement_timeout killed the query)
 * - 57P01: admin_shutdown (DB shutting down)
 * - 57P02: crash_shutdown
 * - 57P03: cannot_connect_now
 * - CONNECTION_*: postgres.js driver-level connection errors
 * - CONNECT_TIMEOUT: postgres.js pool/connect timeout
 */
const RETRYABLE_PG_CODES = new Set([
	"57014",
	"57P01",
	"57P02",
	"57P03",
	// postgres.js driver-level codes
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	"CONNECT_TIMEOUT",
	// Node.js network errors (from TCP layer, before postgres protocol)
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"EPIPE",
]);

/**
 * Returns true if the error is a Postgres/infrastructure issue that may
 * resolve on retry (connection lost, timeout, resource exhaustion, etc.).
 * Returns false for application errors (constraint violations, syntax errors, etc.).
 */
export const isRetryableDbError = ({ error }: { error: unknown }): boolean => {
	const code = getErrorCode({ error });
	if (!code) return false;

	if (RETRYABLE_PG_CODES.has(code)) return true;
	if (RETRYABLE_PG_CODE_PREFIXES.some((prefix) => code.startsWith(prefix)))
		return true;

	return false;
};

/** Throws if DATABASE_URL looks like a production database. Single source of truth for this check. */
export const assertNotProductionDb = () => {
	const url = process.env.DATABASE_URL || "";
	if (url.includes("us-west-3")) {
		throw new Error(
			"Refusing to run against production database (DATABASE_URL contains us-west)",
		);
	}
};

export const buildConflictUpdateColumns = <T extends PgTable>(
	table: T,
	excludeColumns: (keyof T["_"]["columns"])[] = [],
) => {
	const cls = getTableColumns(table);
	const updateSet: Record<string, SQL> = {};

	for (const [columnKey, columnConfig] of Object.entries(cls)) {
		if (!excludeColumns.includes(columnKey as keyof T["_"]["columns"])) {
			updateSet[columnKey] = sql.raw(`excluded.${columnConfig.name}`);
		}
	}

	return updateSet;
};
