import { type SQL, sql } from "drizzle-orm";
import type { CustomerFilter } from "../filters/customerFilter.js";
import { compileFilter } from "./compileFilter.js";
import type { ResolutionContext } from "./filterToIr/resolutionContext.js";

/**
 * Top-level query builders for customer-rooted migration filters.
 *
 * `compileFilter` returns the full WHERE expression (including org/env
 * pushdown via the registry's ambient predicates). These helpers wrap it
 * into a complete, parameterized Drizzle `SQL` with cursor-based
 * pagination for iteration over large customer sets.
 */

export const DEFAULT_BATCH_SIZE = 10_000;

/** Convert the compiler's `{ sql, params }` output to a Drizzle SQL chunk. */
function rawWithParamsToDrizzle({
	sql: raw,
	params,
}: {
	sql: string;
	params: readonly unknown[];
}): SQL {
	const parts = raw.split("?");
	if (parts.length - 1 !== params.length)
		throw new Error(
			`Placeholder/param count mismatch: ${parts.length - 1} placeholders vs ${params.length} params`,
		);
	const chunks: SQL[] = [];
	for (let i = 0; i < parts.length; i++) {
		chunks.push(sql.raw(parts[i]));
		if (i < params.length) chunks.push(sql`${params[i]}`);
	}
	return sql.join(chunks, sql.raw(""));
}

type BuildArgs = {
	orgId: string;
	env: string;
	filter: CustomerFilter;
	ctx: ResolutionContext;
};

const compileWhere = ({ orgId, env, filter, ctx }: BuildArgs): SQL =>
	rawWithParamsToDrizzle(
		compileFilter({ filter, ctx, ambient: { orgId, env } }),
	);

/** Full SELECT. Returns `{ internal_id, id }` rows. */
export function buildCustomerSelect({
	orgId,
	env,
	filter,
	ctx,
	limit,
	afterInternalId,
}: BuildArgs & { limit?: number; afterInternalId?: string }): SQL {
	const where = compileWhere({ orgId, env, filter, ctx });
	const cursor = afterInternalId
		? sql`AND c.internal_id > ${afterInternalId}`
		: sql``;
	const limitClause = limit !== undefined ? sql`LIMIT ${limit}` : sql``;
	return sql`
		SELECT c.internal_id, c.id
		FROM customers c
		WHERE (${where}) ${cursor}
		ORDER BY c.internal_id
		${limitClause}
	`;
}

/** COUNT(*) applying the same filter. */
export function buildCustomerCount({
	orgId,
	env,
	filter,
	ctx,
}: BuildArgs): SQL {
	const where = compileWhere({ orgId, env, filter, ctx });
	return sql`
		SELECT COUNT(*)::bigint AS count
		FROM customers c
		WHERE (${where})
	`;
}

/**
 * Iterate matching customers in batches (default 10k per step) using
 * keyset pagination on `c.internal_id`. Yields one batch at a time so
 * callers can stream-process without loading the full result set.
 */
export async function* iterateCustomers({
	db,
	orgId,
	env,
	filter,
	ctx,
	batchSize = DEFAULT_BATCH_SIZE,
}: BuildArgs & {
	db: { execute: (query: SQL) => Promise<unknown> };
	batchSize?: number;
}): AsyncGenerator<Array<{ internal_id: string; id: string | null }>> {
	let cursor: string | undefined;
	while (true) {
		const query = buildCustomerSelect({
			orgId,
			env,
			filter,
			ctx,
			limit: batchSize,
			afterInternalId: cursor,
		});
		const rows = (await db.execute(query)) as unknown as Array<{
			internal_id: string;
			id: string | null;
		}>;
		if (rows.length === 0) return;
		yield rows;
		if (rows.length < batchSize) return;
		cursor = rows[rows.length - 1].internal_id;
	}
}
