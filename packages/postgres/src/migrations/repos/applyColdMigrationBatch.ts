import { randomUUID } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import type { QueryResult } from "pg";
import { z } from "zod/v4";
import { inlineSqlParams } from "../../common/inlineSqlParams.js";
import type { PostgresDb } from "../../types/postgresClient.js";
import type {
	ColdMigrationBatch,
	ColdMigrationBatchResult,
} from "../types/coldMigrationBatch.js";

export const COLD_MIGRATION_NOT_OWNER_MARKER = "cold_migration_not_owner:";
export const COLD_MIGRATION_FORCED_ROLLBACK_MARKER =
	"cold_migration_forced_rollback:";

const COLD_MIGRATION_STATEMENT_TIMEOUT_MS = 10_000;

const idList = z.union([
	z.array(z.string()),
	z.string().transform((text) => z.array(z.string()).parse(JSON.parse(text))),
]);
const count = z.union([z.number(), z.string(), z.bigint()]).transform(Number);
const resultSchema = z.object({
	applied: idList,
	stale: idList,
	settled: idList,
	deleted: count,
	updated: count,
	snapshots_deleted: count,
	runs_marked: count,
});

const opsDocumentOf = ({ batch }: { batch: ColdMigrationBatch }): string =>
	JSON.stringify(
		batch.customers.flatMap((customer) =>
			customer.ops.map((op) => ({
				internal_customer_id: customer.internalCustomerId,
				org_id: customer.orgId,
				env: customer.env,
				customer_id: customer.customerId,
				migration_internal_id: customer.migrationInternalId,
				migration_run_id: customer.migrationRunId,
				kind: op.kind,
				ce_id: op.customerEntitlementId,
				expect_cols: op.expect ?? {},
				expect_product: op.expectProduct !== undefined,
				expect_product_cols: op.expectProduct?.columns ?? {},
				expect_price_ids: op.expectProduct?.customerPriceIds ?? [],
				without_rollovers: op.withoutRollovers ?? false,
				set_cols: op.set ?? {},
				add_balance: op.addBalance ?? 0,
			})),
		),
	);

const opsSql = ({ document }: { document: string }): SQL => sql`ops AS (
		SELECT * FROM jsonb_to_recordset(${document}::text::jsonb) AS o(
			internal_customer_id text, org_id text, env text, customer_id text,
			migration_internal_id text, migration_run_id text,
			kind text, ce_id text, expect_cols jsonb,
			expect_product boolean, expect_product_cols jsonb, expect_price_ids jsonb,
			without_rollovers boolean, set_cols jsonb, add_balance numeric
		)
	)`;

const lockSql = ({
	batch,
	document,
	nonce,
}: {
	batch: ColdMigrationBatch;
	document: string;
	nonce: string;
}): SQL => sql`
	WITH ${opsSql({ document })},
	own AS (
		SELECT 1 FROM partition_progress
		WHERE topic = ${batch.topic} AND partition_id = ${batch.partition} AND claim_token = ${batch.claimToken}
		FOR SHARE
	),
	ce_locked AS (
		SELECT ce.id, ce.customer_product_id FROM customer_entitlements ce
		WHERE ce.id IN (SELECT ce_id FROM ops)
		ORDER BY ce.id
		FOR UPDATE
	),
	cp_locked AS (
		SELECT cp.id FROM customer_products cp
		WHERE cp.id IN (SELECT customer_product_id FROM ce_locked)
		ORDER BY cp.id
		FOR SHARE
	),
	runs_locked AS (
		SELECT r.item_id FROM migration_item_runs r
		WHERE r.item_kind = 'customer' AND r.dry_run = false
			AND (r.migration_internal_id, r.migration_run_id, r.item_id) IN (
				SELECT migration_internal_id, migration_run_id, internal_customer_id FROM ops
			)
		ORDER BY r.item_id
		FOR UPDATE
	)
	SELECT CASE WHEN (SELECT count(*) FROM own) = 1
		THEN (SELECT count(*) FROM ce_locked) + 0 * (SELECT count(*) FROM cp_locked) + 0 * (SELECT count(*) FROM runs_locked)
		ELSE (${`${COLD_MIGRATION_NOT_OWNER_MARKER}${nonce}:`}::text || (SELECT count(*) FROM own))::integer END AS locked`;

const applySql = ({ document }: { document: string }): SQL => sql`
	WITH ${opsSql({ document })},
	checked AS (
		SELECT o.internal_customer_id,
			(ce.id IS NOT NULL
				AND ce.internal_customer_id = o.internal_customer_id
				AND (NOT o.expect_cols ? 'entitlement_id' OR ce.entitlement_id IS NOT DISTINCT FROM o.expect_cols->>'entitlement_id')
				AND (NOT o.expect_product OR (
					cp.id IS NOT NULL
					AND (NOT o.expect_product_cols ? 'internal_product_id' OR cp.internal_product_id IS NOT DISTINCT FROM o.expect_product_cols->>'internal_product_id')
					AND (NOT o.expect_product_cols ? 'status' OR cp.status IS NOT DISTINCT FROM o.expect_product_cols->>'status')
					AND (NOT o.expect_product_cols ? 'is_custom' OR cp.is_custom IS NOT DISTINCT FROM (o.expect_product_cols->>'is_custom')::boolean)
					AND (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}'::text[]) FROM customer_prices p WHERE p.customer_product_id = cp.id)
						= (SELECT coalesce(array_agg(x ORDER BY x), '{}'::text[]) FROM jsonb_array_elements_text(o.expect_price_ids) x)
				))
				AND (NOT o.without_rollovers OR NOT EXISTS (SELECT 1 FROM rollovers rl WHERE rl.cus_ent_id = ce.id))
			) AS ok
		FROM ops o
		LEFT JOIN customer_entitlements ce ON ce.id = o.ce_id
		LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
	),
	runs_open AS (
		SELECT r.item_id FROM migration_item_runs r
		WHERE r.item_kind = 'customer' AND r.dry_run = false AND r.status = 'running'
			AND (r.migration_internal_id, r.migration_run_id, r.item_id) IN (
				SELECT migration_internal_id, migration_run_id, internal_customer_id FROM ops
			)
	),
	passing AS (
		SELECT internal_customer_id FROM checked
		GROUP BY internal_customer_id
		HAVING bool_and(ok)
	),
	applying AS (
		SELECT internal_customer_id FROM passing
		WHERE internal_customer_id IN (SELECT item_id FROM runs_open)
	),
	deleted AS (
		DELETE FROM customer_entitlements ce
		USING ops o
		WHERE o.kind = 'delete' AND ce.id = o.ce_id
			AND o.internal_customer_id IN (SELECT internal_customer_id FROM applying)
		RETURNING ce.id
	),
	set_by_ce AS (
		SELECT o.ce_id, jsonb_object_agg(e.k, e.v) AS set_cols
		FROM ops o
		CROSS JOIN LATERAL jsonb_each(o.set_cols) AS e(k, v)
		WHERE o.kind = 'update'
			AND o.internal_customer_id IN (SELECT internal_customer_id FROM applying)
		GROUP BY o.ce_id
	),
	add_by_ce AS (
		SELECT o.ce_id, sum(o.add_balance) AS add_balance
		FROM ops o
		WHERE o.kind = 'increment'
			AND o.internal_customer_id IN (SELECT internal_customer_id FROM applying)
		GROUP BY o.ce_id
	),
	updates AS (
		SELECT coalesce(s.ce_id, a.ce_id) AS ce_id,
			coalesce(s.set_cols, '{}'::jsonb) AS set_cols,
			coalesce(a.add_balance, 0) AS add_balance
		FROM set_by_ce s
		FULL OUTER JOIN add_by_ce a ON a.ce_id = s.ce_id
	),
	updated AS (
		UPDATE customer_entitlements ce SET
			entitlement_id = CASE WHEN u.set_cols ? 'entitlement_id' THEN u.set_cols->>'entitlement_id' ELSE ce.entitlement_id END,
			internal_feature_id = CASE WHEN u.set_cols ? 'internal_feature_id' THEN u.set_cols->>'internal_feature_id' ELSE ce.internal_feature_id END,
			feature_id = CASE WHEN u.set_cols ? 'feature_id' THEN u.set_cols->>'feature_id' ELSE ce.feature_id END,
			reset_cycle_anchor = CASE WHEN u.set_cols ? 'reset_cycle_anchor' THEN (u.set_cols->>'reset_cycle_anchor')::numeric ELSE ce.reset_cycle_anchor END,
			next_reset_at = CASE WHEN u.set_cols ? 'next_reset_at' THEN (u.set_cols->>'next_reset_at')::numeric ELSE ce.next_reset_at END,
			unlimited = CASE WHEN u.set_cols ? 'unlimited' THEN (u.set_cols->>'unlimited')::boolean ELSE ce.unlimited END,
			balance = (CASE WHEN u.set_cols ? 'balance' THEN (u.set_cols->>'balance')::numeric ELSE ce.balance END) + u.add_balance,
			cache_version = COALESCE(ce.cache_version, 0) + 1
		FROM updates u
		WHERE ce.id = u.ce_id
		RETURNING ce.id
	),
	snapshots AS (
		DELETE FROM subject_snapshots s
		USING (
			SELECT DISTINCT org_id, env, customer_id FROM ops
			WHERE internal_customer_id IN (SELECT internal_customer_id FROM applying)
		) AS d
		WHERE s.org_id = d.org_id COLLATE "C"
			AND s.env = d.env COLLATE "C"
			AND s.customer_id = d.customer_id COLLATE "C"
		RETURNING 1
	),
	runs AS (
		UPDATE migration_item_runs r SET
			status = 'succeeded',
			skip_reason = NULL,
			updated_at = floor(extract(epoch from clock_timestamp()) * 1000)
		FROM (
			SELECT DISTINCT migration_internal_id, migration_run_id, internal_customer_id FROM ops
			WHERE internal_customer_id IN (SELECT internal_customer_id FROM applying)
		) AS a
		WHERE r.migration_internal_id = a.migration_internal_id
			AND r.migration_run_id = a.migration_run_id
			AND r.item_kind = 'customer' AND r.dry_run = false AND r.status = 'running'
			AND r.item_id = a.internal_customer_id
		RETURNING r.item_id
	)
	SELECT
		(SELECT coalesce(json_agg(internal_customer_id), '[]'::json) FROM applying) AS applied,
		(SELECT coalesce(json_agg(DISTINCT internal_customer_id), '[]'::json) FROM checked
			WHERE internal_customer_id NOT IN (SELECT internal_customer_id FROM passing)
				AND internal_customer_id IN (SELECT item_id FROM runs_open)) AS stale,
		(SELECT coalesce(json_agg(DISTINCT internal_customer_id), '[]'::json) FROM ops
			WHERE internal_customer_id NOT IN (SELECT item_id FROM runs_open)) AS settled,
		(SELECT count(*) FROM deleted) AS deleted,
		(SELECT count(*) FROM updated) AS updated,
		(SELECT count(*) FROM snapshots) AS snapshots_deleted,
		(SELECT count(*) FROM runs) AS runs_marked`;

type StatementResult = Pick<QueryResult, "rows">;

const lastResultRows = ({
	results,
}: {
	results: StatementResult | StatementResult[];
}): unknown[] =>
	(Array.isArray(results) ? results.at(-1) : results)?.rows ?? [];

export class ColdMigrationBatchRolledBackError extends Error {
	readonly reason: string;

	constructor({ reason, cause }: { reason: string; cause: unknown }) {
		super(`Cold migration batch rolled back: ${reason}`, { cause });
		this.name = "ColdMigrationBatchRolledBackError";
		this.reason = reason;
	}
}

const rollbackReasonOf = ({
	error,
	nonce,
}: {
	error: unknown;
	nonce: string;
}): string | null => {
	for (let cause = error; cause instanceof Error; cause = cause.cause) {
		if (cause.message.includes(`${COLD_MIGRATION_NOT_OWNER_MARKER}${nonce}`))
			return "not_owner";
		if (
			cause.message.includes(`${COLD_MIGRATION_FORCED_ROLLBACK_MARKER}${nonce}`)
		)
			return "forced";
	}
	return null;
};

/** One simple query, one implicit transaction: the lock statement, then the guarded writes on a snapshot taken after the locks. */
export const applyColdMigrationBatch = async ({
	ctx,
	batch,
}: {
	ctx: { db: Pick<PostgresDb, "execute"> };
	batch: ColdMigrationBatch;
}): Promise<ColdMigrationBatchResult> => {
	if (batch.customers.length === 0)
		return {
			applied: [],
			stale: [],
			settled: [],
			deleted: 0,
			updated: 0,
			snapshotsDeleted: 0,
			runsMarked: 0,
		};
	const nonce = randomUUID().replaceAll("-", "");
	const document = opsDocumentOf({ batch });
	const lock = inlineSqlParams({
		statement: lockSql({ batch, document, nonce }),
	});
	const apply = inlineSqlParams({ statement: applySql({ document }) });
	if (lock === null || apply === null)
		throw new Error("Cold migration batch has a value with no literal");
	const forcedRollback = batch.forceRollback
		? `; SELECT ('${COLD_MIGRATION_FORCED_ROLLBACK_MARKER}${nonce}:' || count(*))::integer FROM customer_entitlements WHERE id = ''`
		: "";
	let results: StatementResult | StatementResult[];
	try {
		results = await ctx.db.execute(
			sql.raw(
				`SET LOCAL statement_timeout = ${COLD_MIGRATION_STATEMENT_TIMEOUT_MS}; ${lock}; ${apply}${forcedRollback}`,
			),
		);
	} catch (error) {
		const reason = rollbackReasonOf({ error, nonce });
		if (reason)
			throw new ColdMigrationBatchRolledBackError({ reason, cause: error });
		throw error;
	}
	const parsed = resultSchema.parse(lastResultRows({ results })[0]);
	return {
		applied: parsed.applied,
		stale: parsed.stale,
		settled: parsed.settled,
		deleted: parsed.deleted,
		updated: parsed.updated,
		snapshotsDeleted: parsed.snapshots_deleted,
		runsMarked: parsed.runs_marked,
	};
};

/** Resident customers' item runs, once the worker's store holds their plans. */
export const markMigrationItemRunsSucceeded = async ({
	ctx,
	runs,
}: {
	ctx: { db: Pick<PostgresDb, "execute"> };
	runs: readonly {
		migrationInternalId: string;
		migrationRunId: string;
		internalCustomerId: string;
	}[];
}): Promise<number> => {
	if (runs.length === 0) return 0;
	const document = JSON.stringify(
		runs.map((run) => ({
			migration_internal_id: run.migrationInternalId,
			migration_run_id: run.migrationRunId,
			item_id: run.internalCustomerId,
		})),
	);
	const { rows } = await ctx.db.execute(sql`
		WITH marked AS (
			UPDATE migration_item_runs r SET
				status = 'succeeded',
				skip_reason = NULL,
				updated_at = floor(extract(epoch from clock_timestamp()) * 1000)
			FROM jsonb_to_recordset(${document}::text::jsonb) AS a(migration_internal_id text, migration_run_id text, item_id text)
			WHERE r.migration_internal_id = a.migration_internal_id
				AND r.migration_run_id = a.migration_run_id
				AND r.item_kind = 'customer' AND r.dry_run = false AND r.status = 'running'
				AND r.item_id = a.item_id
			RETURNING 1
		)
		SELECT count(*) AS marked FROM marked
	`);
	return count.parse((rows[0] as { marked: unknown } | undefined)?.marked ?? 0);
};

/** The item runs among `runs` still waiting for their customer, so a redelivered record is never applied twice. */
export const readOpenMigrationItemRuns = async ({
	ctx,
	runs,
}: {
	ctx: { db: Pick<PostgresDb, "execute"> };
	runs: readonly {
		migrationInternalId: string;
		migrationRunId: string;
		internalCustomerId: string;
	}[];
}): Promise<Set<string>> => {
	if (runs.length === 0) return new Set();
	const document = JSON.stringify(
		runs.map((run) => ({
			migration_internal_id: run.migrationInternalId,
			migration_run_id: run.migrationRunId,
			item_id: run.internalCustomerId,
		})),
	);
	const { rows } = await ctx.db.execute(sql`
		SELECT r.migration_internal_id, r.migration_run_id, r.item_id
		FROM migration_item_runs r
		JOIN jsonb_to_recordset(${document}::text::jsonb) AS a(migration_internal_id text, migration_run_id text, item_id text)
			ON r.migration_internal_id = a.migration_internal_id
			AND r.migration_run_id = a.migration_run_id
			AND r.item_id = a.item_id
		WHERE r.item_kind = 'customer' AND r.dry_run = false AND r.status = 'running'
	`);
	return new Set(
		(
			rows as {
				migration_internal_id: string;
				migration_run_id: string;
				item_id: string;
			}[]
		).map((row) =>
			itemRunKeyOf({
				migrationInternalId: row.migration_internal_id,
				migrationRunId: row.migration_run_id,
				internalCustomerId: row.item_id,
			}),
		),
	);
};

export const itemRunKeyOf = ({
	migrationInternalId,
	migrationRunId,
	internalCustomerId,
}: {
	migrationInternalId: string;
	migrationRunId: string;
	internalCustomerId: string;
}): string =>
	JSON.stringify([migrationInternalId, migrationRunId, internalCustomerId]);
