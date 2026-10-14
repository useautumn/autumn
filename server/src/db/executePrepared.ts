import { createHash } from "node:crypto";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { DrizzleCli } from "./initDrizzle.js";

const dialect = new PgDialect();

const tracer = trace.getTracer("@kubiks/otel-drizzle");

const operationOf = (text: string) =>
	text.trimStart().split(/\s+/, 1)[0]?.toUpperCase() ?? "UNKNOWN";

const spanNameFor = (operation: string) => `drizzle.${operation.toLowerCase()}`;

const MAX_STATEMENT_CHARS = 1000;
const truncateStatement = (text: string) =>
	text.length > MAX_STATEMENT_CHARS
		? `${text.slice(0, MAX_STATEMENT_CHARS)}...`
		: text;

const MAX_DISTINCT_STATEMENTS = 100;

const preparedTexts = new Map<string, string>();

let overflowWarned = false;

const isEnabled = () => process.env.PREPARED_STATEMENTS_DISABLED !== "true";

const poolOf = (db: DrizzleCli): Pool | null =>
	(db as unknown as { $client?: Pool }).$client ?? null;

const statementName = ({ label, text }: { label: string; text: string }) =>
	`${label}_${createHash("sha1").update(text).digest("hex").slice(0, 16)}`;

/**
 * Executes a Drizzle SQL fragment as a server-side **named** prepared statement.
 *
 * Postgres plans a named statement once per connection and reuses that plan;
 * node-postgres only sends a named Parse when `name` is supplied, so without
 * this every execution re-plans from scratch and PgBouncer's
 * `max_prepared_statements` never sees the statement at all.
 *
 * Callers must keep their SQL text invariant across executions: bind values as
 * parameters, and use `sql.param(list)` for arrays so the text doesn't grow a
 * placeholder per element. `experiments/checkFullSubjectSqlStability.ts` guards
 * this for getFullSubject.
 *
 * Falls back to an unprepared execution rather than failing the request if the
 * driver exposes no pool, the shape count overflows, or preparation is disabled.
 */
export const executePrepared = async <TRow = Record<string, unknown>>({
	db,
	query,
	label,
}: {
	db: DrizzleCli;
	query: SQL;
	label: string;
}): Promise<TRow[]> => {
	const pool = poolOf(db);
	if (!(pool && isEnabled())) return db.execute<TRow>(query);

	const { sql: text, params } = dialect.sqlToQuery(query);
	const name = statementName({ label, text });
	const knownText = preparedTexts.get(name);

	if (knownText === undefined) {
		if (preparedTexts.size >= MAX_DISTINCT_STATEMENTS) {
			if (!overflowWarned) {
				overflowWarned = true;
				logger.warn(
					`[executePrepared] ${MAX_DISTINCT_STATEMENTS} distinct statements reached; ` +
						"further shapes run unprepared. A query is likely emitting unstable SQL text.",
					{ label },
				);
			}
			return db.execute<TRow>(query);
		}
		preparedTexts.set(name, text);
	} else if (knownText !== text) {
		throw new Error(`[executePrepared] name collision for "${name}"`);
	}

	const operation = operationOf(text);

	return tracer.startActiveSpan(
		spanNameFor(operation),
		{ kind: SpanKind.CLIENT },
		async (span) => {
			span.setAttributes({
				"db.system": "postgresql",
				"db.operation": operation,
				"db.statement": truncateStatement(text),
				"db.prepared_statement_name": name,
				"autumn.db.label": label,
			});

			try {
				// Untyped on purpose: pg constrains its generic to QueryResultRow,
				const result = await pool.query({ name, text, values: params });
				span.setAttribute("db.response.returned_rows", result.rowCount ?? 0);
				span.setStatus({ code: SpanStatusCode.OK });
				return result.rows as TRow[];
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error instanceof Error ? error.message : String(error),
				});
				throw error;
			} finally {
				span.end();
			}
		},
	);
};

export const preparedStatementNames = (): string[] => [...preparedTexts.keys()];
