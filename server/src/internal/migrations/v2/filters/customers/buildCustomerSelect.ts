import type { CustomerFilter, MigrationItemRunStatus } from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import type { ResolutionContext } from "@autumn/shared/api/migrations/compiler/filterToIr/resolutionContext.js";
import { type SQL, sql } from "drizzle-orm";
import { rawWithParamsToDrizzle } from "../rawWithParamsToDrizzle.js";

export type CustomerQueryArgs = {
	orgId: string;
	env: string;
	filter: CustomerFilter;
	ctx: ResolutionContext;
	checkpoint?: CustomerCheckpointExclusion;
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
	limit,
	afterInternalId,
}: CustomerQueryArgs & {
	limit?: number;
	afterInternalId?: string;
}): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const checkpointWhere = buildCheckpointWhere(checkpoint);
	const cursor = afterInternalId
		? sql`AND c.internal_id < ${afterInternalId}`
		: sql``;
	const limitClause = limit !== undefined ? sql`LIMIT ${limit}` : sql``;
	return sql`
		SELECT c.internal_id, c.id
		FROM customers c
		WHERE (${where}) ${checkpointWhere} ${cursor}
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
}: CustomerQueryArgs): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const checkpointWhere = buildCheckpointWhere(checkpoint);
	return sql`
		SELECT COUNT(*)::bigint AS count
		FROM customers c
		WHERE (${where}) ${checkpointWhere}
	`;
};
