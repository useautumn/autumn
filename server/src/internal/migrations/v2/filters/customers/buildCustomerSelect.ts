import type { CustomerFilter, MigrationItemRunStatus } from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import type { ResolutionContext } from "@autumn/shared/api/migrations/compiler/filterToIr/resolutionContext.js";
import { type SQL, sql } from "drizzle-orm";
import { rawWithParamsToDrizzle } from "../rawWithParamsToDrizzle.js";

export type IncludeProcessed = {
	migrationInternalId: string;
};

export type CustomerQueryArgs = {
	orgId: string;
	env: string;
	filter: CustomerFilter;
	ctx: ResolutionContext;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	includeProcessed?: IncludeProcessed;
};

const compileWhere = ({ orgId, env, filter, ctx }: CustomerQueryArgs): SQL =>
	rawWithParamsToDrizzle(
		compileFilter({ filter, ctx, ambient: { orgId, env } }),
	);

export type CustomerCheckpointExclusion = {
	migrationInternalId: string;
	migrationRunId: string;
	dryRun: boolean;
	excludedStatuses: MigrationItemRunStatus[];
};

const buildCheckpointWhere = (
	checkpoint: CustomerCheckpointExclusion | undefined,
): SQL => {
	if (!checkpoint || checkpoint.excludedStatuses.length === 0) return sql``;

	const checkpointScope = checkpoint.dryRun
		? sql`AND (
				mir.dry_run = false
				OR (
					mir.dry_run = true
					AND mir.migration_run_id = ${checkpoint.migrationRunId}
				)
			)`
		: sql`AND mir.dry_run = false`;
	const statuses = sql.join(
		checkpoint.excludedStatuses.map((status) => sql`${status}`),
		sql`, `,
	);

	return sql`
		AND NOT EXISTS (
			SELECT 1
			FROM migration_item_runs mir
			WHERE mir.migration_internal_id = ${checkpoint.migrationInternalId}
				${checkpointScope}
				AND mir.item_kind = 'customer'
				AND mir.item_id = c.internal_id
				AND mir.status IN (${statuses})
		)
	`;
};

const buildSearchWhere = (search: string | undefined): SQL => {
	if (!search) return sql``;
	const pattern = `%${search}%`;
	return sql`AND (c.name ILIKE ${pattern} OR c.email ILIKE ${pattern} OR c.id ILIKE ${pattern})`;
};

const buildIncludeProcessedOr = (
	includeProcessed: IncludeProcessed | undefined,
): SQL => {
	if (!includeProcessed) return sql``;
	return sql`OR c.internal_id IN (
		SELECT mir.item_id FROM migration_item_runs mir
		WHERE mir.migration_internal_id = ${includeProcessed.migrationInternalId}
			AND mir.item_kind = 'customer'
			AND mir.dry_run = false
	)`;
};

/**
 * Full SELECT. Returns `{ internal_id, id }` rows newest-first via keyset
 * pagination on `c.internal_id DESC`, so successive iterations over an
 * unchanged customer set yield rows in the same order.
 */
export const buildCustomerSelect = ({
	orgId,
	env,
	filter,
	ctx,
	checkpoint,
	search,
	includeProcessed,
	limit,
	afterInternalId,
}: CustomerQueryArgs & {
	limit?: number;
	afterInternalId?: string;
}): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const checkpointWhere = buildCheckpointWhere(checkpoint);
	const searchWhere = buildSearchWhere(search);
	const processedOr = buildIncludeProcessedOr(includeProcessed);
	const cursor = afterInternalId
		? sql`AND c.internal_id < ${afterInternalId}`
		: sql``;
	const limitClause = limit !== undefined ? sql`LIMIT ${limit}` : sql``;
	return sql`
		SELECT c.internal_id, c.id, c.name, c.email
		FROM customers c
		WHERE ((${where}) ${processedOr}) ${checkpointWhere} ${searchWhere} ${cursor}
		ORDER BY c.internal_id DESC
		${limitClause}
	`;
};

/** COUNT(*) applying the same filter. */
export const buildCustomerCount = ({
	orgId,
	env,
	filter,
	ctx,
	checkpoint,
	search,
	includeProcessed,
}: CustomerQueryArgs): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const checkpointWhere = buildCheckpointWhere(checkpoint);
	const searchWhere = buildSearchWhere(search);
	const processedOr = buildIncludeProcessedOr(includeProcessed);
	return sql`
		SELECT COUNT(*)::bigint AS count
		FROM customers c
		WHERE ((${where}) ${processedOr}) ${checkpointWhere} ${searchWhere}
	`;
};
