import { createHash } from "node:crypto";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { DrizzleCli } from "./initDrizzle.js";

const dialect = new PgDialect();

/**
 * DB spans in this service come only from `instrumentDrizzleClient` in
 * initDrizzle — there is no @opentelemetry/instrumentation-pg. Because this
 * helper goes straight to the pg Pool (see poolOf), Drizzle never sees the call
 * and would emit nothing, so the span is raised by hand here.
 *
 * It deliberately impersonates @kubiks/otel-drizzle rather than taking its own
 * identity. Three panels in the infra-health dashboard filter on
 * `scope.name == '@kubiks/otel-drizzle'`, and spanMetrics.ts derives the
 * `autumn.db.query.duration_ms` histogram's `operation` label from
 * `span.name.slice("drizzle.".length)` — so a different tracer name makes these
 * spans invisible, and a fixed span name silently forks the metric series.
 */
const tracer = trace.getTracer("@kubiks/otel-drizzle");

/** Leading keyword, for db.operation. */
const operationOf = (text: string) =>
	text.trimStart().split(/\s+/, 1)[0]?.toUpperCase() ?? "UNKNOWN";

/** Matches the library: `drizzle.${leading keyword, lowercased}`. getFullSubject
 *  compiles to text starting with WITH, so these land as `drizzle.with`. */
const spanNameFor = (operation: string) => `drizzle.${operation.toLowerCase()}`;

/** The library capped db.statement at 1000 chars plus a literal "...". Same
 *  shape here. Do NOT trim or normalise the text — the leading whitespace is
 *  what distinguishes the three getFullSubjectQuery variants in the dashboards. */
const MAX_STATEMENT_CHARS = 1000;
const truncateStatement = (text: string) =>
	text.length > MAX_STATEMENT_CHARS
		? `${text.slice(0, MAX_STATEMENT_CHARS)}...`
		: text;

/** Kept under PgBouncer's `max_prepared_statements` (200) so the pooler tracks
 *  every statement we mint rather than silently dropping the overflow. */
const MAX_DISTINCT_STATEMENTS = 100;

/** Statement name -> the exact SQL text it was first prepared with. node-postgres
 *  caches by name per connection and a name bound to two different texts poisons
 *  that connection, so we detect the collision here instead. */
const preparedTexts = new Map<string, string>();

let overflowWarned = false;

const isEnabled = () => process.env.PREPARED_STATEMENTS_DISABLED !== "true";

/** node-postgres pool behind a Drizzle client, or null for drivers without one. */
const poolOf = (db: DrizzleCli): Pool | null =>
	(db as unknown as { $client?: Pool }).$client ?? null;

/** Stable, content-addressed statement name. Same SQL always yields the same
 *  name across processes and restarts; edited SQL yields a new one. */
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
	/** Must compile to identical text on every call — only params may vary. */
	query: SQL;
	/** Short prefix identifying the call site, e.g. "getFullSubject". */
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
		// Content-addressed names make this unreachable short of a SHA-1 collision;
		// throwing beats poisoning every connection in the pool.
		throw new Error(`[executePrepared] name collision for "${name}"`);
	}

	const operation = operationOf(text);

	return tracer.startActiveSpan(
		spanNameFor(operation),
		{ kind: SpanKind.CLIENT },
		async (span) => {
			span.setAttributes({
				// These three reproduce the library's attribute set exactly.
				"db.system": "postgresql",
				"db.operation": operation,
				"db.statement": truncateStatement(text),
				// Additive — the library emitted no equivalent.
				"db.prepared_statement_name": name,
				"autumn.db.label": label,
			});

			try {
				// Untyped on purpose: pg constrains its generic to QueryResultRow,
				// which is narrower than the row shapes callers of db.execute() use.
				const result = await pool.query({ name, text, values: params });
				span.setAttribute("db.response.returned_rows", result.rowCount ?? 0);
				// The library set OK explicitly; leaving it UNSET flips status.code
				// from "OK" to null in the dataset.
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

/** Statement names minted by this process — for diagnostics and tests. */
export const preparedStatementNames = (): string[] => [...preparedTexts.keys()];
