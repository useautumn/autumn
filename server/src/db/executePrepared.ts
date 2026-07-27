import { createHash } from "node:crypto";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { DrizzleCli } from "./initDrizzle.js";

const dialect = new PgDialect();

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

	// Untyped on purpose: pg constrains its generic to QueryResultRow, which is
	// narrower than the row shapes callers of db.execute() use.
	const result = await pool.query({ name, text, values: params });
	return result.rows as TRow[];
};

/** Statement names minted by this process — for diagnostics and tests. */
export const preparedStatementNames = (): string[] => [...preparedTexts.keys()];
