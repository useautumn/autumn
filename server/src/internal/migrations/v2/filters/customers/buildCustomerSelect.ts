import type { CustomerFilter, MigrationItemRunStatus } from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import type { ResolutionContext } from "@autumn/shared/api/migrations/compiler/filterToIr/resolutionContext.js";
import { type SQL, sql } from "drizzle-orm";
import { rawWithParamsToDrizzle } from "../rawWithParamsToDrizzle.js";

export type IncludeProcessed = {
	migrationInternalId: string;
	executionFilter?: CustomerExecutionStatusFilter;
};

export type CustomerExecutionStatus = MigrationItemRunStatus | "not_run";

export type CustomerExecutionStatusFilter = {
	statuses: CustomerExecutionStatus[];
	migrationRunId?: string;
	dryRun?: boolean;
};

export type CustomerQueryArgs = {
	orgId: string;
	env: string;
	filter: CustomerFilter;
	ctx: ResolutionContext;
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
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

const buildProcessedIn = (includeProcessed: IncludeProcessed): SQL => sql`
	c.internal_id IN (
		SELECT mir.item_id FROM migration_item_runs mir
		WHERE mir.migration_internal_id = ${includeProcessed.migrationInternalId}
			AND mir.item_kind = 'customer'
			AND mir.dry_run = false
	)`;

const buildExecutionScope = (
	migrationInternalId: string,
	filter: CustomerExecutionStatusFilter | undefined,
): SQL => {
	const dryRunScope =
		filter?.dryRun !== undefined
			? sql`AND mir.dry_run = ${filter.dryRun}`
			: sql`AND mir.dry_run = false`;
	const runScope = filter?.migrationRunId
		? sql`AND mir.migration_run_id = ${filter.migrationRunId}`
		: sql``;

	return sql`
		mir.migration_internal_id = ${migrationInternalId}
			AND mir.item_kind = 'customer'
			${dryRunScope}
			${runScope}
	`;
};

const buildExecutionStatusWhere = (
	includeProcessed: IncludeProcessed | undefined,
	{ includeNotRun = true }: { includeNotRun?: boolean } = {},
): SQL => {
	const filter = includeProcessed?.executionFilter;
	if (!includeProcessed || !filter || filter.statuses.length === 0) return sql``;

	const explicitStatuses = filter.statuses.filter(
		(status): status is MigrationItemRunStatus => status !== "not_run",
	);
	const clauses: SQL[] = [];

	if (explicitStatuses.length > 0) {
		const statuses = sql.join(
			explicitStatuses.map((status) => sql`${status}`),
			sql`, `,
		);
		clauses.push(sql`
			EXISTS (
				SELECT 1
				FROM migration_item_runs mir
				WHERE ${buildExecutionScope(includeProcessed.migrationInternalId, filter)}
					AND mir.item_id = c.internal_id
					AND mir.status IN (${statuses})
			)
		`);
	}

	if (includeNotRun && filter.statuses.includes("not_run")) {
		clauses.push(sql`
			NOT EXISTS (
				SELECT 1
				FROM migration_item_runs mir
				WHERE ${buildExecutionScope(includeProcessed.migrationInternalId, filter)}
					AND mir.item_id = c.internal_id
			)
		`);
	}

	if (clauses.length === 0) return sql`AND false`;
	return clauses.length === 1
		? sql`AND ${clauses[0]}`
		: sql`AND (${sql.join(clauses, sql` OR `)})`;
};

const getExecutionFilterMode = (
	includeProcessed: IncludeProcessed,
): "all" | "explicit_only" | "not_run_only" | "mixed" => {
	const statuses = includeProcessed.executionFilter?.statuses;
	if (!statuses || statuses.length === 0) return "all";

	const hasNotRun = statuses.includes("not_run");
	const hasExplicit = statuses.some((status) => status !== "not_run");
	if (hasExplicit && hasNotRun) return "mixed";
	if (hasExplicit) return "explicit_only";
	return "not_run_only";
};

// Predicates shared by both UNION branches (and the single-branch query).
// Rebuilt per call so a branch never reuses another's SQL chunk instance.
const buildCommonWhere = ({
	checkpoint,
	search,
	afterInternalId,
	includeProcessed,
	includeNotRun,
}: {
	checkpoint?: CustomerCheckpointExclusion;
	search?: string;
	afterInternalId?: string;
	includeProcessed?: IncludeProcessed;
	includeNotRun?: boolean;
}): SQL => {
	const cursor = afterInternalId
		? sql`AND c.internal_id < ${afterInternalId}`
		: sql``;
	return sql`${buildCheckpointWhere(checkpoint)} ${buildSearchWhere(search)} ${buildExecutionStatusWhere(includeProcessed, { includeNotRun })} ${cursor}`;
};

/**
 * Full SELECT. Returns `{ internal_id, id }` rows newest-first via keyset
 * pagination on `c.internal_id DESC`, so successive iterations over an
 * unchanged customer set yield rows in the same order.
 *
 * Pure filter set only — the run path. To also surface already-processed
 * customers (preview live view), use `buildProcessedPreviewSelect`.
 */
export const buildCustomerSelect = ({
	orgId,
	env,
	filter,
	ctx,
	checkpoint,
	search,
	limit,
	afterInternalId,
}: CustomerQueryArgs & {
	limit?: number;
	afterInternalId?: string;
}): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const limitClause = limit !== undefined ? sql`LIMIT ${limit}` : sql``;
	return sql`
		SELECT c.internal_id, c.id, c.name, c.email
		FROM customers c
		WHERE (${where}) ${buildCommonWhere({ checkpoint, search, afterInternalId })}
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
}: CustomerQueryArgs): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	return sql`
		SELECT COUNT(*)::bigint AS count
		FROM customers c
		WHERE (${where}) ${buildCommonWhere({ checkpoint, search })}
	`;
};

// ─── Preview-only: filter set ∪ already-processed set ────────────────
// The live view surfaces customers an in-flight migration already ran for,
// which the live filter no longer matches. We UNION the two scoped sets
// rather than OR them: an `OR ... IN (...)` strips org/env scoping from the
// customers scan and forces a full-table seq scan, whereas each UNION branch
// keeps its own index. Equivalent to `(filter OR processed) AND <common>`
// because `<common>` (checkpoint/search/cursor) is applied per branch.

type ProcessedPreviewArgs = CustomerQueryArgs & {
	includeProcessed: IncludeProcessed;
};

export const buildProcessedPreviewSelect = ({
	orgId,
	env,
	filter,
	ctx,
	checkpoint,
	search,
	includeProcessed,
	limit,
	afterInternalId,
}: ProcessedPreviewArgs & {
	limit?: number;
	afterInternalId?: string;
}): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const processed = buildProcessedIn(includeProcessed);
	const limitClause = limit !== undefined ? sql`LIMIT ${limit}` : sql``;
	const mode = getExecutionFilterMode(includeProcessed);

	if (mode === "explicit_only") {
		return sql`
			SELECT c.internal_id, c.id, c.name, c.email
			FROM customers c
			WHERE (${processed}) ${buildCommonWhere({ checkpoint, search, afterInternalId, includeProcessed, includeNotRun: false })}
			ORDER BY c.internal_id DESC
			${limitClause}
		`;
	}

	if (mode === "not_run_only") {
		return sql`
			SELECT c.internal_id, c.id, c.name, c.email
			FROM customers c
			WHERE (${where}) ${buildCommonWhere({ checkpoint, search, afterInternalId, includeProcessed })}
			ORDER BY c.internal_id DESC
			${limitClause}
		`;
	}

	return sql`
		SELECT u.internal_id, u.id, u.name, u.email
		FROM (
			SELECT c.internal_id, c.id, c.name, c.email
			FROM customers c
			WHERE (${where}) ${buildCommonWhere({ checkpoint, search, afterInternalId, includeProcessed })}
			UNION
			SELECT c.internal_id, c.id, c.name, c.email
			FROM customers c
			WHERE (${processed}) ${buildCommonWhere({ checkpoint, search, afterInternalId, includeProcessed, includeNotRun: false })}
		) u
		ORDER BY u.internal_id DESC
		${limitClause}
	`;
};

export const buildProcessedPreviewCount = ({
	orgId,
	env,
	filter,
	ctx,
	checkpoint,
	search,
	includeProcessed,
}: ProcessedPreviewArgs): SQL => {
	const where = compileWhere({ orgId, env, filter, ctx });
	const processed = buildProcessedIn(includeProcessed);
	const mode = getExecutionFilterMode(includeProcessed);

	if (mode === "explicit_only") {
		return sql`
			SELECT COUNT(*)::bigint AS count
			FROM customers c
			WHERE (${processed}) ${buildCommonWhere({ checkpoint, search, includeProcessed, includeNotRun: false })}
		`;
	}

	if (mode === "not_run_only") {
		return sql`
			SELECT COUNT(*)::bigint AS count
			FROM customers c
			WHERE (${where}) ${buildCommonWhere({ checkpoint, search, includeProcessed })}
		`;
	}

	return sql`
		SELECT COUNT(*)::bigint AS count
		FROM (
			SELECT c.internal_id
			FROM customers c
			WHERE (${where}) ${buildCommonWhere({ checkpoint, search, includeProcessed })}
			UNION
			SELECT c.internal_id
			FROM customers c
			WHERE (${processed}) ${buildCommonWhere({ checkpoint, search, includeProcessed, includeNotRun: false })}
		) u
	`;
};
