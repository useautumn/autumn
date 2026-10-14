import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export const isUniqueConstraintError = (error: unknown): boolean => {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
};

const getErrorCode = ({ error }: { error: unknown }): string | null => {
	if (typeof error !== "object" || error === null) return null;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
};

const getErrorMessage = ({ error }: { error: unknown }): string | null =>
	error instanceof Error ? error.message : null;

const walkErrorChain = ({ error }: { error: unknown }): unknown[] => {
	const chain: unknown[] = [];
	const seen = new Set<unknown>();
	let current: unknown = error;
	while (current !== undefined && current !== null && !seen.has(current)) {
		seen.add(current);
		chain.push(current);
		if (typeof current !== "object" || !("cause" in current)) break;
		current = (current as { cause: unknown }).cause;
	}
	return chain;
};

const messageLooksTransient = ({ message }: { message: string }): boolean => {
	if (TRANSIENT_DB_ERROR_MESSAGES.has(message)) return true;
	for (const known of TRANSIENT_DB_ERROR_MESSAGES) {
		if (message.includes(known)) return true;
	}
	return false;
};

const TRANSIENT_DB_ERROR_MESSAGES = new Set([
	"timeout exceeded when trying to connect",
	"Query read timeout",
	"Connection terminated due to connection timeout",
	"Connection terminated unexpectedly",
	"canceling statement due to lock timeout",
	"canceling statement due to statement timeout",
	// pg throws this on any query issued after the client's socket already
	// died. The original drop is transient, but Drizzle's transaction wrapper
	"Client has encountered a connection error and is not queryable",
]);

const RETRYABLE_PG_CODE_PREFIXES = ["08", "53"];

const RETRYABLE_PG_CODES = new Set([
	"25P03",
	"57014",
	"57P01",
	"57P02",
	"57P03",
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	"CONNECT_TIMEOUT",
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"EPIPE",
]);

export const isTransientDbError = ({ error }: { error: unknown }): boolean => {
	for (const candidate of walkErrorChain({ error })) {
		const message = getErrorMessage({ error: candidate });
		if (message && messageLooksTransient({ message })) return true;

		const code = getErrorCode({ error: candidate });
		if (!code) continue;
		if (RETRYABLE_PG_CODES.has(code)) return true;
		if (RETRYABLE_PG_CODE_PREFIXES.some((prefix) => code.startsWith(prefix)))
			return true;
	}

	return false;
};

const CONNECTION_DROP_CODES = new Set([
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	"ECONNRESET",
	"ECONNREFUSED",
	"57P01",
	"57P02",
]);

export const isConnectionDropError = ({
	error,
}: {
	error: unknown;
}): boolean => {
	const code = getErrorCode({ error });
	if (!code) return false;
	return CONNECTION_DROP_CODES.has(code);
};

export const assertNotProductionDb = (url = process.env.DATABASE_URL || "") => {
	if (url.includes("us-east-2")) {
		throw new Error(
			"Refusing to run against production database (connection string contains us-east-2)",
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

export const planetScaleTag = (tags: Record<string, string>): SQL => {
	const sortedKeys = Object.keys(tags).sort();

	const tagPairs = sortedKeys
		.map((key) => {
			const value = encodeURIComponent(tags[key]).replace(/'/g, "\\'");
			return `${key}='${value}'`;
		})
		.join(",");

	return sql.raw(`/*${tagPairs}*/`);
};
